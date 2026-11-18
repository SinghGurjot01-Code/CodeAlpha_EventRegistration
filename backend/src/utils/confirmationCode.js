const { randomInt } = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a unique ticket confirmation code matching the EventHub format `EH-XXXXXX`.
 */
function generateConfirmationCode(length = 6) {
  let code = 'EH-';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

module.exports = { generateConfirmationCode };
