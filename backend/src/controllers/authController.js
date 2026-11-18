const { setSessionCookie, clearSessionCookie } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const register = asyncHandler(async (req, res) => {
  const { authService, config } = req.ctx;
  const { fullName, name, email, password, phone, organization, org, role } = req.body || {};
  const { user, token } = await authService.register({
    fullName: fullName ?? name,
    email,
    password,
    phone,
    organization: organization ?? org,
    role,
    guestCodes: req.guestCodes,
  });
  setSessionCookie(res, token, config.sessionTtlHours);
  res.status(201).json({ user, token });
});

const login = asyncHandler(async (req, res) => {
  const { authService, config } = req.ctx;
  const { email, password } = req.body || {};
  const { user, token } = await authService.login({
    email,
    password,
    guestCodes: req.guestCodes,
  });
  setSessionCookie(res, token, config.sessionTtlHours);
  res.json({ user, token });
});

const logout = asyncHandler(async (req, res) => {
  clearSessionCookie(res);
  res.json({ loggedOut: true });
});

const me = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not signed in.', user: null });
  }
  res.json({ user: req.user });
});

module.exports = { register, login, logout, me };
