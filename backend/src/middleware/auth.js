const COOKIE_NAME = 'eh_token';

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || null;
}

function extractGuestCodes(req) {
  const headerCodes = req.headers['x-guest-codes'] || req.query?.codes || '';
  const bodyCodes = Array.isArray(req.body?.guestCodes) ? req.body.guestCodes : [];
  const fromStr = typeof headerCodes === 'string' ? headerCodes.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return [...new Set([...fromStr, ...bodyCodes])];
}

const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    req.user = token ? await req.ctx.authService.authenticateToken(token) : null;
    req.guestCodes = extractGuestCodes(req);
    next();
  } catch (err) {
    next(err);
  }
};

const requireAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    const user = token ? await req.ctx.authService.authenticateToken(token) : null;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    req.user = user;
    req.guestCodes = extractGuestCodes(req);
    next();
  } catch (err) {
    next(err);
  }
};

const requireOrganizer = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  if (req.user.role !== 'organizer') {
    return res.status(403).json({ error: 'Organizer privileges are required for this action.' });
  }
  next();
};

function setSessionCookie(res, token, ttlHours = 168) {
  const maxAge = Math.max(1, Number(ttlHours) || 168) * 3600;
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

module.exports = {
  COOKIE_NAME,
  optionalAuth,
  requireAuth,
  requireOrganizer,
  setSessionCookie,
  clearSessionCookie,
};
