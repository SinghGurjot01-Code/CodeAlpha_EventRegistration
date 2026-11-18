(function () {
  var API_BASE = ((window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || '').replace(/\/+$/, '');
  var IMAGES = window.EVENTHUB_IMAGES || {};

  var I = {
    pin: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8 15h3"/></svg>',
    ppl: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .7 3.5 2.5 3.5 5.6"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
  };

  // Clear obsolete demo-only localStorage keys if present; server + D1 is authoritative.
  // Only non-sensitive guest ticket codes (`eh_guest_codes`) and session JWT (`eh_auth_token`) are stored locally.
  try {
    localStorage.removeItem('eh_users');
    localStorage.removeItem('eh_session');
    localStorage.removeItem('eh_regs');
  } catch (e) {}

  function ld(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  }
  function sv(k, v) {
    try {
      if (v === null || v === undefined || v === '') localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }

  var authToken = ld('eh_auth_token', '');
  var guestCodes = ld('eh_guest_codes', []);
  var currentUser = null;
  var E = [];
  var regs = [];
  var view = 'home';
  var loadingEvents = true;

  var $ = function (s) {
    return document.querySelector(s);
  };
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML.replace(/"/g, '&quot;');
  }
  function me() {
    return currentUser;
  }
  function resolveImg(ref, cat) {
    if (ref && ref.indexOf('data:image/') === 0) return ref;
    if (ref && IMAGES[ref]) return IMAGES[ref];
    if (cat && IMAGES[cat]) return IMAGES[cat];
    return IMAGES.Conference || '';
  }

  function mapEvent(ev) {
    return {
      id: ev.id,
      t: ev.title,
      c: ev.category,
      l: ev.location,
      d: ev.eventDate,
      n: ev.registeredCount,
      m: ev.maxCapacity,
      availableSeats: ev.availableSeats,
      img: resolveImg(ev.imageReference, ev.category),
      about: ev.description || '',
      organizerId: ev.organizerId,
      status: ev.status
    };
  }

  function mapReg(r) {
    return {
      id: r.id,
      code: r.confirmationCode,
      eid: r.eventId,
      userId: r.userId,
      name: r.fullName,
      email: r.email,
      phone: r.phone,
      org: r.organization || '',
      qty: r.ticketQuantity,
      status: r.status,
      at: r.createdAt
    };
  }

  function evById(id) {
    return E.filter(function (e) {
      return e.id == id;
    })[0];
  }
  function count(e) {
    return Number(e.n || 0);
  }
  function myReg(e) {
    return regs.filter(function (r) {
      return r.eid == e.id && r.status === 'confirmed';
    })[0];
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    if (guestCodes && guestCodes.length) headers['X-Guest-Codes'] = guestCodes.join(',');
    return fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!r.ok) {
            var error = new Error(data.error || 'Something went wrong. Please try again.');
            error.status = r.status;
            error.data = data;
            throw error;
          }
          return data;
        });
    });
  }

  function open(h) {
    $('#dlb').innerHTML = h;
    if (!$('#dlg').open) $('#dlg').showModal();
  }
  function close() {
    if ($('#dlg').open) $('#dlg').close();
  }
  function err(m) {
    if ($('#er')) $('#er').textContent = m;
  }
  function act(e) {
    if (!e) return;
    var r = myReg(e);
    r ? ticket(r) : regForm(e);
  }

  function fetchEvents() {
    var q = $('#q').value.trim();
    var c = $('#cat').value;
    var when = $('#when').value;
    var params = new URLSearchParams();
    if (q) params.set('q', q);
    if (c) params.set('category', c);
    if (when) params.set('when', when);
    return api('/api/events?' + params.toString()).then(function (res) {
      E = (res.events || []).map(mapEvent);
      loadingEvents = false;
    });
  }

  function fetchMyRegistrations() {
    return api('/api/registrations/my')
      .then(function (res) {
        regs = (res.registrations || []).map(mapReg);
      })
      .catch(function () {
        regs = [];
      });
  }

  function refreshAll() {
    return Promise.all([fetchEvents(), fetchMyRegistrations()]).then(function () {
      render();
    });
  }

  function render() {
    var q = $('#q').value.trim().toLowerCase(),
      c = $('#cat').value,
      past = $('#when').value === 'past';
    var L = E.filter(function (e) {
      return (!c || e.c === c) && (view !== 'mine' || myReg(e)) && (!q || (e.t + e.c + e.l).toLowerCase().indexOf(q) > -1);
    });
    $('#title').textContent = view === 'mine' ? 'My Registrations' : past ? 'Past Events' : 'Upcoming Events';
    if (loadingEvents) {
      $('#grid').innerHTML = '<div class="empty">Loading events...</div>';
      return;
    }
    $('#grid').innerHTML = L.length
      ? L.map(function (e) {
          var r = myReg(e),
            full = !r && count(e) >= e.m;
          return (
            '<article class="card"><div class="ph"><img src="' +
            e.img +
            '" alt="" loading="lazy"><span class="tag ' +
            e.c +
            '">' +
            esc(e.c) +
            '</span></div><div class="cb"><h3>' +
            esc(e.t) +
            '</h3><div class="row">' +
            I.pin +
            esc(e.l) +
            '</div><div class="row">' +
            I.cal +
            esc(e.d) +
            '</div><div class="row">' +
            I.ppl +
            count(e) +
            ' / ' +
            e.m +
            ' registered</div><div class="act"><button class="btn out" data-d="' +
            e.id +
            '">View Details</button><button class="btn' +
            (r ? ' on' : '') +
            '" data-r="' +
            e.id +
            '"' +
            (full ? ' disabled' : '') +
            '>' +
            (r ? 'View Ticket' : full ? 'Sold Out' : 'Register Now') +
            '</button></div></div></article>'
          );
        }).join('')
      : '<div class="empty">' +
        (view === 'mine' ? 'You have not registered for any events yet.' : 'No events match your search.') +
        '</div>';
  }

  function userUI() {
    var u = me(),
      el = $('#user');
    if (!u) {
      el.innerHTML = '<button class="btn out" id="si">Sign in</button>';
      $('#si').onclick = function () {
        acct('up');
      };
      return;
    }
    var displayName = u.fullName || u.name || u.email;
    el.innerHTML =
      '<button class="who" id="who" aria-haspopup="true"><span class="av">' +
      esc(displayName.charAt(0).toUpperCase()) +
      '</span><b>' +
      esc(displayName) +
      '</b>' +
      I.chev +
      '</button>';
    $('#who').onclick = function (ev) {
      ev.stopPropagation();
      var m = $('#menu');
      if (m) {
        m.remove();
        return;
      }
      var d = document.createElement('div');
      d.className = 'menu';
      d.id = 'menu';
      d.innerHTML =
        '<div class="note" style="padding:8px 12px">' +
        esc(u.email) +
        '</div><button data-a="mine">My Registrations</button><button data-a="out">Sign out</button>';
      el.appendChild(d);
      d.onclick = function (e) {
        var a = e.target.dataset.a;
        if (a === 'mine') go('mine');
        if (a === 'out') {
          api('/api/auth/logout', { method: 'POST' }).catch(function () {});
          currentUser = null;
          authToken = '';
          sv('eh_auth_token', '');
          userUI();
          refreshAll();
        }
        d.remove();
      };
    };
  }
  document.addEventListener('click', function () {
    var m = $('#menu');
    if (m) m.remove();
  });

  function acct(mode, after) {
    var up = mode === 'up';
    open(
      '<h3>' +
        (up ? 'Create account' : 'Sign in') +
        '</h3><div class="tabs"><button data-m="up" class="' +
        (up ? 'on' : '') +
        '">Create account</button><button data-m="in" class="' +
        (up ? '' : 'on') +
        '">Sign in</button></div>' +
        (up ? '<label>Full name<input id="an" autocomplete="name"></label>' : '') +
        '<label>Email<input id="ae" type="email" autocomplete="email"></label><label>Password<input id="ap" type="password" autocomplete="' +
        (up ? 'new-password' : 'current-password') +
        '"></label><p class="err" id="er"></p><button class="btn" id="go">' +
        (up ? 'Create account' : 'Sign in') +
        '</button><p class="note">Optional. You can also register for events as a guest or sign in to manage events and tickets.</p>'
    );
    $('.tabs').onclick = function (e) {
      if (e.target.dataset.m) acct(e.target.dataset.m, after);
    };
    $('#go').onclick = function () {
      var em = $('#ae').value.trim().toLowerCase(),
        pw = $('#ap').value,
        nm = up ? $('#an').value.trim() : '';
      if (up && !nm) return err('Enter your full name.');
      if (!/^\S+@\S+\.\S+$/.test(em)) return err('Enter a valid email address.');
      if (up && pw.length < 6) return err('Use a password with at least 6 characters.');

      var btn = $('#go');
      btn.disabled = true;
      btn.textContent = up ? 'Creating account...' : 'Signing in...';
      err('');

      var endpoint = up ? '/api/auth/register' : '/api/auth/login';
      var payload = up
        ? { fullName: nm, email: em, password: pw, guestCodes: guestCodes }
        : { email: em, password: pw, guestCodes: guestCodes };

      api(endpoint, { method: 'POST', body: payload })
        .then(function (res) {
          currentUser = res.user;
          authToken = res.token || '';
          sv('eh_auth_token', authToken);
          userUI();
          return refreshAll();
        })
        .then(function () {
          close();
          if (after) after();
        })
        .catch(function (e) {
          btn.disabled = false;
          btn.textContent = up ? 'Create account' : 'Sign in';
          err(e.message);
        });
    };
  }

  function regForm(e) {
    var u = me(),
      mx = Math.max(1, Math.min(5, e.m - count(e))),
      o = '';
    for (var i = 1; i <= mx; i++) o += '<option>' + i + '</option>';
    open(
      '<h3>Register for event</h3><div class="sum"><img src="' +
        e.img +
        '" alt=""><div><b>' +
        esc(e.t) +
        '</b><p class="note">' +
        esc(e.d) +
        '<br>' +
        esc(e.l) +
        '</p></div></div>' +
        '<div class="two"><label>Full name<input id="rn" autocomplete="name" value="' +
        esc(u ? u.fullName || u.name : '') +
        '"></label><label>Email<input id="re" type="email" autocomplete="email" value="' +
        esc(u ? u.email : '') +
        '"></label></div>' +
        '<div class="two"><label>Phone<input id="rp" type="tel" autocomplete="tel" value="' +
        esc((u && u.phone) || '') +
        '"></label><label>Tickets<select id="rq">' +
        o +
        '</select></label></div>' +
        '<label>College or company (optional)<input id="ro" value="' +
        esc((u && (u.organization || u.org)) || '') +
        '"></label>' +
        '<label class="chk"><input type="checkbox" id="rt"><span>I agree to receive event updates and follow the event rules.</span></label><p class="err" id="er"></p>' +
        '<div class="act"><button class="btn out" data-x>Cancel</button><button class="btn" id="rs">Confirm registration</button></div>' +
        (u ? '' : '<p class="note">Have an account? <a href="#" id="rsi">Sign in</a> to fill this in automatically.</p>')
    );
    if ($('#rsi'))
      $('#rsi').onclick = function (ev) {
        ev.preventDefault();
        acct('in', function () {
          var updated = evById(e.id) || e;
          act(updated);
        });
      };
    $('#rs').onclick = function () {
      var nm = $('#rn').value.trim(),
        em = $('#re').value.trim().toLowerCase(),
        ph = $('#rp').value.trim(),
        og = $('#ro').value.trim(),
        qty = +$('#rq').value;
      if (!nm) return err('Enter your full name.');
      if (!/^\S+@\S+\.\S+$/.test(em)) return err('Enter a valid email address.');
      if (ph.replace(/\D/g, '').length < 7) return err('Enter a valid phone number.');
      if (!$('#rt').checked) return err('Please accept the terms to continue.');
      if (count(e) + qty > e.m) return err('Not enough seats left for that many tickets.');

      var btn = $('#rs');
      btn.disabled = true;
      btn.textContent = 'Confirming...';
      err('');

      api('/api/events/' + e.id + '/register', {
        method: 'POST',
        body: { fullName: nm, email: em, phone: ph, organization: og, ticketQuantity: qty }
      })
        .then(function (res) {
          var r = mapReg(res.registration);
          if (!me()) {
            if (guestCodes.indexOf(r.code) === -1) {
              guestCodes.push(r.code);
              sv('eh_guest_codes', guestCodes);
            }
          } else {
            currentUser.phone = ph;
            currentUser.organization = og;
          }
          return refreshAll().then(function () {
            ticket(r, true);
          });
        })
        .catch(function (error) {
          btn.disabled = false;
          btn.textContent = 'Confirm registration';
          err(error.message);
        });
    };
  }

  function ticket(r, nw) {
    var e = evById(r.eid) || { t: 'Event', d: '', l: '' };
    open(
      '<h3>' +
        (nw ? 'You’re registered!' : 'Your ticket') +
        '</h3><div class="ticket"><p class="note">Confirmation code</p><div class="code">' +
        esc(r.code) +
        '</div><p style="font-weight:600;margin:6px 0 2px">' +
        esc(e.t) +
        '</p><p class="note">' +
        esc(e.d) +
        ' • ' +
        esc(e.l) +
        '</p><p class="note" style="margin-top:8px">' +
        esc(r.name) +
        ' • ' +
        r.qty +
        (r.qty > 1 ? ' tickets' : ' ticket') +
        '</p></div>' +
        (me() || !nw
          ? ''
          : '<p class="note">Want to keep your tickets together? <a href="#" id="mk">Create a free account</a>.</p>') +
        '<div class="act"><button class="btn out" data-c="' +
        esc(r.code) +
        '">Cancel registration</button><button class="btn" data-x>Done</button></div>'
    );
    if ($('#mk'))
      $('#mk').onclick = function (ev) {
        ev.preventDefault();
        acct('up', function () {
          ticket(r);
        });
      };
  }

  $('#dlg').onclick = function (ev) {
    var b = ev.target.closest('button');
    if (ev.target === $('#dlg') || (b && b.hasAttribute('data-x'))) return close();
    if (!b) return;
    if (b.dataset.rr) {
      close();
      act(evById(b.dataset.rr));
    }
    if (b.dataset.c) {
      if (!b.dataset.s) {
        b.dataset.s = 1;
        b.textContent = 'Tap again to confirm';
        return;
      }
      b.disabled = true;
      b.textContent = 'Cancelling...';
      var codeToCancel = b.dataset.c;
      api('/api/registrations/' + encodeURIComponent(codeToCancel), { method: 'DELETE' })
        .then(function () {
          guestCodes = guestCodes.filter(function (c) {
            return c !== codeToCancel;
          });
          sv('eh_guest_codes', guestCodes);
          return refreshAll();
        })
        .then(function () {
          close();
        })
        .catch(function (error) {
          b.disabled = false;
          b.textContent = error.message || 'Could not cancel';
        });
    }
  };

  $('#grid').onclick = function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.r) act(evById(b.dataset.r));
    if (b.dataset.d) {
      var id = b.dataset.d;
      api('/api/events/' + encodeURIComponent(id))
        .then(function (res) {
          var e = mapEvent(res.event);
          E = E.map(function (item) {
            return item.id == e.id ? e : item;
          });
          open(
            '<h3>' +
              esc(e.t) +
              '</h3><div class="row">' +
              I.pin +
              esc(e.l) +
              '</div><div class="row">' +
              I.cal +
              esc(e.d) +
              '</div><p style="margin:0;color:var(--mute)">' +
              esc(e.about) +
              '</p><div class="act"><button class="btn out" data-x>Close</button><button class="btn" data-rr="' +
              e.id +
              '">' +
              (myReg(e) ? 'View Ticket' : 'Register Now') +
              '</button></div>'
          );
        })
        .catch(function () {
          var e = evById(id);
          if (!e) return;
          open(
            '<h3>' +
              esc(e.t) +
              '</h3><div class="row">' +
              I.pin +
              esc(e.l) +
              '</div><div class="row">' +
              I.cal +
              esc(e.d) +
              '</div><p style="margin:0;color:var(--mute)">' +
              esc(e.about) +
              '</p><div class="act"><button class="btn out" data-x>Close</button><button class="btn" data-rr="' +
              e.id +
              '">' +
              (myReg(e) ? 'View Ticket' : 'Register Now') +
              '</button></div>'
          );
        });
    }
  };

  function openCreateEventModal() {
    if (!me()) {
      acct('up', function () {
        openCreateEventModal();
      });
      return;
    }
    open(
      '<h3>Create Event</h3><label>Title<input id="nt"></label><label>Category<select id="nc"><option>Conference</option><option>Workshop</option><option>Summit</option><option>Hackathon</option></select></label><label>Location<input id="nl"></label><label>Date and time<input id="nd" placeholder="Sat, Apr 5, 2025 • 10:00 AM"></label><p class="err" id="er"></p><div class="act"><button class="btn out" data-x>Cancel</button><button class="btn" id="save">Create Event</button></div>'
    );
    $('#save').onclick = function () {
      var t = $('#nt').value.trim();
      if (!t) {
        $('#nt').focus();
        return err('Enter an event title.');
      }
      var c = $('#nc').value;
      var l = $('#nl').value.trim() || 'To be announced';
      var d = $('#nd').value.trim() || 'Date to be announced';
      var btn = $('#save');
      btn.disabled = true;
      btn.textContent = 'Creating...';
      err('');

      api('/api/events', {
        method: 'POST',
        body: {
          title: t,
          category: c,
          location: l,
          eventDate: d,
          maxCapacity: 100,
          description: 'Created by you.',
          imageReference: c
        }
      })
        .then(function () {
          return refreshAll();
        })
        .then(function () {
          close();
          go('events');
        })
        .catch(function (error) {
          btn.disabled = false;
          btn.textContent = 'Create Event';
          err(error.message);
        });
    };
  }

  $('#create').onclick = openCreateEventModal;

  function sync() {
    document.querySelectorAll('nav button').forEach(function (b) {
      if (b.dataset.v === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#hero').style.display = view === 'home' ? '' : 'none';
  }
  function go(v) {
    view = v;
    sync();
    render();
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('nav button').forEach(function (b) {
    b.onclick = function () {
      go(b.dataset.v);
    };
  });
  $('#browse').onclick = function () {
    $('#q').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  var searchTimer = null;
  $('#q').addEventListener('input', function () {
    render();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      fetchEvents().then(render);
    }, 200);
  });
  ['#cat', '#when'].forEach(function (s) {
    $(s).addEventListener('change', function () {
      fetchEvents().then(render);
    });
  });

  // Boot: verify current session with `/api/auth/me`, then load events and user/guest registrations from D1
  api('/api/auth/me')
    .then(function (res) {
      currentUser = res.user || null;
    })
    .catch(function () {
      currentUser = null;
      authToken = '';
      sv('eh_auth_token', '');
    })
    .then(function () {
      userUI();
      return refreshAll();
    });
})();
