// Full integration test suite for CodeAlpha EventHub (Express.js on Cloudflare Workers + D1).
const test = require('node:test');
const assert = require('node:assert');
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 8794;
const base = `http://127.0.0.1:${PORT}`;
const cwd = path.join(__dirname, '..');
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'eventhub-d1-'));
let proc;

function startWorker() {
  return new Promise((resolve, reject) => {
    proc = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist], {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('wrangler dev did not become ready')), 90000);
    const onData = (d) => {
      if (/Ready on/.test(d.toString())) {
        clearTimeout(timer);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (c) => {
      clearTimeout(timer);
      reject(new Error('wrangler exited early: ' + c));
    });
  });
}

function stopWorker() {
  return new Promise((resolve) => {
    if (!proc) return resolve();
    proc.removeAllListeners('exit');
    proc.once('exit', resolve);
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } catch {}
    } else {
      proc.kill('SIGTERM');
    }
    setTimeout(resolve, 3000);
  });
}

test.before(async () => {
  execSync(`npx wrangler d1 migrations apply codealpha-eventhub-db --local --persist-to "${persist}"`, {
    cwd,
    stdio: 'ignore',
  });
  await startWorker();
});

test.after(async () => {
  await stopWorker();
  try {
    fs.rmSync(persist, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  } catch {}
});

async function req(method, urlPath, { body, token, guestCodes } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (guestCodes && guestCodes.length) headers['X-Guest-Codes'] = guestCodes.join(',');
  const r = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data, headers: r.headers };
}

let organizerToken = '';
let organizerUser = null;
let attendeeToken = '';
let attendeeUser = null;
let createdEventId = null;
let userRegCode = '';
let guestRegCode = '';

test('1. Health endpoint returns 200 OK', async () => {
  const { status, data } = await req('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
});

test('2. Frontend static assets are served identically', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /EventHub/);
  assert.match(html, /Discover &amp; Register for/);
  assert.equal((await fetch(`${base}/css/styles.css`)).status, 200);
  assert.equal((await fetch(`${base}/js/app.js`)).status, 200);
});

test('3. User registration creates account and never exposes password_hash', async () => {
  const { status, data } = await req('POST', '/api/auth/register', {
    body: {
      fullName: 'Aarav Sharma',
      email: 'aarav@example.com',
      password: 'Password123',
      phone: '9876543210',
      organization: 'CodeAlpha Tech',
      role: 'organizer',
    },
  });
  assert.equal(status, 201);
  assert.ok(data.token);
  assert.equal(data.user.fullName, 'Aarav Sharma');
  assert.equal(data.user.email, 'aarav@example.com');
  assert.equal(data.user.role, 'organizer');
  assert.equal(data.user.password_hash, undefined);
  assert.equal(data.user.passwordHash, undefined);
  organizerToken = data.token;
  organizerUser = data.user;

  // Duplicate email registration must fail with 409
  const dup = await req('POST', '/api/auth/register', {
    body: { fullName: 'Dup', email: 'aarav@example.com', password: 'Password123' },
  });
  assert.equal(dup.status, 409);

  // Register a regular attendee (role: 'user')
  const att = await req('POST', '/api/auth/register', {
    body: {
      fullName: 'Priya Verma',
      email: 'priya@example.com',
      password: 'Password123',
      role: 'user',
    },
  });
  assert.equal(att.status, 201);
  attendeeToken = att.data.token;
  attendeeUser = att.data.user;
});

test('4. Login, current-user (/api/auth/me), invalid credentials, and logout', async () => {
  const bad = await req('POST', '/api/auth/login', {
    body: { email: 'aarav@example.com', password: 'WrongPassword' },
  });
  assert.equal(bad.status, 401);

  const login = await req('POST', '/api/auth/login', {
    body: { email: 'aarav@example.com', password: 'Password123' },
  });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);

  const me = await req('GET', '/api/auth/me', { token: organizerToken });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'aarav@example.com');

  const unauthMe = await req('GET', '/api/auth/me');
  assert.equal(unauthMe.status, 401);

  const out = await req('POST', '/api/auth/logout');
  assert.equal(out.status, 200);
  assert.equal(out.data.loggedOut, true);
});

test('5. Event listing, details, search, category and date filters', async () => {
  const list = await req('GET', '/api/events');
  assert.equal(list.status, 200);
  assert.equal(list.data.events.length, 3);

  const detail = await req('GET', '/api/events/1');
  assert.equal(detail.status, 200);
  assert.equal(detail.data.event.title, 'Tech Innovators Conference 2025');
  assert.equal(detail.data.event.registeredCount, 120);
  assert.equal(detail.data.event.availableSeats, 80);

  // Search by title
  const searched = await req('GET', '/api/events?q=Startup');
  assert.equal(searched.status, 200);
  assert.equal(searched.data.events.length, 1);
  assert.equal(searched.data.events[0].title, 'Startup Summit 2025');

  // Filter by category
  const workshops = await req('GET', '/api/events?category=Workshop');
  assert.equal(workshops.status, 200);
  assert.equal(workshops.data.events.length, 1);
  assert.equal(workshops.data.events[0].category, 'Workshop');

  // Filter by date (past vs upcoming)
  const past = await req('GET', '/api/events?when=past');
  assert.equal(past.status, 200);
  assert.equal(past.data.events.length, 0);
});

test('6. Organizer event creation & unauthorized event creation prevention', async () => {
  // Unauthenticated cannot create
  const unauth = await req('POST', '/api/events', {
    body: { title: 'Unauth Event', category: 'Hackathon', location: 'Mumbai', eventDate: 'Sun, May 10, 2025' },
  });
  assert.equal(unauth.status, 401);

  // Regular user (role='user') cannot create
  const forbidden = await req('POST', '/api/events', {
    token: attendeeToken,
    body: { title: 'Attendee Event', category: 'Hackathon', location: 'Mumbai', eventDate: 'Sun, May 10, 2025' },
  });
  assert.equal(forbidden.status, 403);

  // Authorized organizer creates event with small capacity (5 seats) for capacity testing
  const created = await req('POST', '/api/events', {
    token: organizerToken,
    body: {
      title: 'AI Builders Hackathon 2025',
      category: 'Hackathon',
      location: 'Hyderabad, India',
      eventDate: 'Sat, Apr 12, 2025 • 9:00 AM',
      description: '24-hour AI product hackathon.',
      maxCapacity: 5,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.event.title, 'AI Builders Hackathon 2025');
  assert.equal(created.data.event.maxCapacity, 5);
  assert.equal(created.data.event.availableSeats, 5);
  assert.equal(created.data.event.organizerId, organizerUser.id);
  createdEventId = created.data.event.id;
});

test('7. Event editing and ownership protection', async () => {
  // Non-organizer cannot edit
  const forbidden = await req('PUT', `/api/events/${createdEventId}`, {
    token: attendeeToken,
    body: { title: 'Hacked Title' },
  });
  assert.equal(forbidden.status, 403);

  // Owner organizer updates event
  const updated = await req('PUT', `/api/events/${createdEventId}`, {
    token: organizerToken,
    body: { location: 'Hyderabad HITEC City, India' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.event.location, 'Hyderabad HITEC City, India');
});

test('8. Successful authenticated registration, multiple ticket quantities, and duplicate prevention', async () => {
  const reg = await req('POST', `/api/events/${createdEventId}/register`, {
    token: attendeeToken,
    body: {
      fullName: attendeeUser.fullName,
      email: attendeeUser.email,
      phone: '9123456789',
      organization: 'IIT Delhi',
      ticketQuantity: 3,
    },
  });
  assert.equal(reg.status, 201);
  assert.match(reg.data.registration.confirmationCode, /^EH-[A-Z0-9]{6}$/);
  assert.equal(reg.data.registration.ticketQuantity, 3);
  assert.equal(reg.data.event.registeredCount, 3);
  assert.equal(reg.data.event.availableSeats, 2);
  userRegCode = reg.data.registration.confirmationCode;

  // Duplicate active registration by same user/email must fail with 409
  const dup = await req('POST', `/api/events/${createdEventId}/register`, {
    token: attendeeToken,
    body: {
      fullName: attendeeUser.fullName,
      email: attendeeUser.email,
      phone: '9123456789',
      ticketQuantity: 1,
    },
  });
  assert.equal(dup.status, 409);
});

test('9. Guest registration and event capacity limit enforcement (overbooking prevention)', async () => {
  // Remaining seats on createdEventId: 2. Requesting 3 tickets must fail with 400.
  const overbook = await req('POST', `/api/events/${createdEventId}/register`, {
    body: {
      fullName: 'Guest User',
      email: 'guest@example.com',
      phone: '9988776655',
      organization: 'Guest Org',
      ticketQuantity: 3,
    },
  });
  assert.equal(overbook.status, 400);
  assert.match(overbook.data.error, /Not enough seats/i);

  // Guest registers for the remaining 2 seats
  const guestReg = await req('POST', `/api/events/${createdEventId}/register`, {
    body: {
      fullName: 'Guest User',
      email: 'guest@example.com',
      phone: '9988776655',
      organization: 'Guest Org',
      ticketQuantity: 2,
    },
  });
  assert.equal(guestReg.status, 201);
  assert.equal(guestReg.data.event.registeredCount, 5);
  assert.equal(guestReg.data.event.availableSeats, 0);
  guestRegCode = guestReg.data.registration.confirmationCode;
  assert.notEqual(guestRegCode, userRegCode);

  // Event is now full (0 available seats) - another guest registration for 1 seat must be rejected
  const fullReject = await req('POST', `/api/events/${createdEventId}/register`, {
    body: {
      fullName: 'Another Guest',
      email: 'another@example.com',
      phone: '9988776600',
      ticketQuantity: 1,
    },
  });
  assert.equal(fullReject.status, 400);
});

test('10. Registration history, ticket lookup, organizer event registrations list, and cancellation', async () => {
  // Authenticated attendee fetches My Registrations
  const myRegs = await req('GET', '/api/registrations/my', { token: attendeeToken });
  assert.equal(myRegs.status, 200);
  assert.equal(myRegs.data.registrations.length, 1);
  assert.equal(myRegs.data.registrations[0].confirmationCode, userRegCode);

  // Guest fetches My Registrations via guestCodes header
  const guestRegs = await req('GET', '/api/registrations/my', { guestCodes: [guestRegCode] });
  assert.equal(guestRegs.status, 200);
  assert.equal(guestRegs.data.registrations.length, 1);
  assert.equal(guestRegs.data.registrations[0].confirmationCode, guestRegCode);

  // Lookup single registration by confirmation code
  const single = await req('GET', `/api/registrations/${userRegCode}`);
  assert.equal(single.status, 200);
  assert.equal(single.data.registration.email, attendeeUser.email);

  // Organizer views all registrations for their event
  const orgList = await req('GET', `/api/events/${createdEventId}/registrations`, { token: organizerToken });
  assert.equal(orgList.status, 200);
  assert.equal(orgList.data.registrations.length, 2);

  // Attendee cancels their registration -> frees 3 seats
  const cancelled = await req('DELETE', `/api/registrations/${userRegCode}`, { token: attendeeToken });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.registration.status, 'cancelled');
  assert.equal(cancelled.data.event.registeredCount, 2);
  assert.equal(cancelled.data.event.availableSeats, 3);
});

test('11. Cancelled events reject new registrations, and organizer can delete event', async () => {
  // Organizer marks event as cancelled
  const cancelEv = await req('PUT', `/api/events/${createdEventId}`, {
    token: organizerToken,
    body: { status: 'cancelled' },
  });
  assert.equal(cancelEv.status, 200);
  assert.equal(cancelEv.data.event.status, 'cancelled');

  // Attempt to register for a cancelled event must fail with 400
  const regCancelled = await req('POST', `/api/events/${createdEventId}/register`, {
    token: attendeeToken,
    body: {
      fullName: attendeeUser.fullName,
      email: attendeeUser.email,
      phone: '9123456789',
      ticketQuantity: 1,
    },
  });
  assert.equal(regCancelled.status, 400);
  assert.match(regCancelled.data.error, /cancelled/i);
});

test('12. Database persistence across Worker restart and event deletion', async () => {
  // Register on seeded event #1 before restart
  const r1 = await req('POST', '/api/events/1/register', {
    token: attendeeToken,
    body: {
      fullName: attendeeUser.fullName,
      email: attendeeUser.email,
      phone: '9123456789',
      ticketQuantity: 2,
    },
  });
  assert.equal(r1.status, 201);
  const codeBeforeRestart = r1.data.registration.confirmationCode;

  // Restart Worker process
  await stopWorker();
  await startWorker();

  // Verify registration and updated seat count persisted in local D1
  const checkReg = await req('GET', `/api/registrations/${codeBeforeRestart}`);
  assert.equal(checkReg.status, 200);
  assert.equal(checkReg.data.registration.confirmationCode, codeBeforeRestart);

  const checkEv = await req('GET', '/api/events/1');
  assert.equal(checkEv.status, 200);
  assert.equal(checkEv.data.event.registeredCount, 122);

  // Organizer deletes their custom event
  const del = await req('DELETE', `/api/events/${createdEventId}`, { token: organizerToken });
  assert.equal(del.status, 200);
  assert.equal(del.data.deleted, true);

  const afterDel = await req('GET', `/api/events/${createdEventId}`);
  assert.equal(afterDel.status, 404);
});
