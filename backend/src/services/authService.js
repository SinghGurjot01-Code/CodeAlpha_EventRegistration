const { hashPassword, verifyPassword, signToken, verifyToken } = require('../utils/crypto');
const { isValidEmail, cleanText, VALID_ROLES } = require('../utils/validators');

function createAuthService({ userRepo, registrationRepo, jwtSecret, sessionTtlHours = 168 }) {
  return {
    async register({ fullName, email, password, phone = '', organization = '', role = 'organizer', guestCodes = [] }) {
      const name = cleanText(fullName, 120);
      if (!name) {
        const err = new Error('Enter your full name.');
        err.status = 400;
        throw err;
      }
      if (!isValidEmail(email)) {
        const err = new Error('Enter a valid email address.');
        err.status = 400;
        throw err;
      }
      if (typeof password !== 'string' || password.length < 6) {
        const err = new Error('Use a password with at least 6 characters.');
        err.status = 400;
        throw err;
      }
      const userRole = VALID_ROLES.includes(role) ? role : 'organizer';
      const existing = await userRepo.findByEmailWithHash(email);
      if (existing) {
        const err = new Error('An account with this email already exists. Sign in instead.');
        err.status = 409;
        throw err;
      }

      const passwordHash = hashPassword(password);
      const user = await userRepo.create({
        fullName: name,
        email,
        passwordHash,
        phone: cleanText(phone, 30),
        organization: cleanText(organization, 120),
        role: userRole,
      });

      if (!user) {
        const err = new Error('An account with this email already exists. Sign in instead.');
        err.status = 409;
        throw err;
      }

      await registrationRepo.claimGuestRegistrations(user.id, user.email, guestCodes);
      const token = signToken({ sub: user.id, email: user.email, role: user.role }, jwtSecret, sessionTtlHours);
      return { user, token };
    },

    async login({ email, password, guestCodes = [] }) {
      if (!isValidEmail(email)) {
        const err = new Error('Enter a valid email address.');
        err.status = 400;
        throw err;
      }
      if (typeof password !== 'string' || !password) {
        const err = new Error('Wrong email or password.');
        err.status = 401;
        throw err;
      }
      const row = await userRepo.findByEmailWithHash(email);
      if (!row || !verifyPassword(password, row.password_hash)) {
        const err = new Error('Wrong email or password.');
        err.status = 401;
        throw err;
      }

      const user = userRepo.toPublicUser(row);
      await registrationRepo.claimGuestRegistrations(user.id, user.email, guestCodes);
      const token = signToken({ sub: user.id, email: user.email, role: user.role }, jwtSecret, sessionTtlHours);
      return { user, token };
    },

    async authenticateToken(token) {
      const payload = verifyToken(token, jwtSecret);
      if (!payload || !payload.sub) return null;
      return userRepo.findById(payload.sub);
    },
  };
}

module.exports = { createAuthService };
