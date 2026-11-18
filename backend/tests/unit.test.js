const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../src/utils/crypto');
const { generateConfirmationCode } = require('../src/utils/confirmationCode');
const { isValidEmail, isValidPhone } = require('../src/utils/validators');

test('hashPassword and verifyPassword securely hash and verify passwords', () => {
  const hash = hashPassword('StrongPass123!');
  assert.ok(hash.startsWith('scrypt:'));
  assert.equal(verifyPassword('StrongPass123!', hash), true);
  assert.equal(verifyPassword('WrongPass', hash), false);
});

test('signToken and verifyToken validate HMAC-SHA256 JWT tokens', () => {
  const secret = 'unit-test-secret-key-at-least-32-bytes';
  const token = signToken({ sub: 42, email: 'alice@example.com', role: 'organizer' }, secret, 24);
  const decoded = verifyToken(token, secret);
  assert.equal(decoded.sub, 42);
  assert.equal(decoded.email, 'alice@example.com');
  assert.equal(verifyToken(token, 'wrong-secret'), null);
  assert.equal(verifyToken(token + 'tamper', secret), null);
});

test('generateConfirmationCode creates unique EH-XXXXXX codes', () => {
  const codes = new Set();
  for (let i = 0; i < 250; i++) {
    const code = generateConfirmationCode(6);
    assert.match(code, /^EH-[A-Z0-9]{6}$/);
    codes.add(code);
  }
  assert.equal(codes.size, 250);
});

test('validators verify emails and phone numbers', () => {
  assert.equal(isValidEmail('user@example.com'), true);
  assert.equal(isValidEmail('bad-email'), false);
  assert.equal(isValidPhone('+91 98765 43210'), true);
  assert.equal(isValidPhone('12345'), false);
});
