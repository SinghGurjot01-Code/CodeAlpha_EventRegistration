const VALID_CATEGORIES = ['Conference', 'Workshop', 'Summit', 'Hackathon'];
const VALID_ROLES = ['user', 'organizer'];
const VALID_EVENT_STATUSES = ['draft', 'published', 'cancelled', 'completed'];

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 254;
}

function isValidPhone(phone) {
  if (typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function cleanText(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

module.exports = {
  VALID_CATEGORIES,
  VALID_ROLES,
  VALID_EVENT_STATUSES,
  isValidEmail,
  isValidPhone,
  cleanText,
};
