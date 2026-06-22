const crypto = require('crypto');

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generatePublicToken() {
  return crypto.randomUUID();
}

function isValidPublicToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

module.exports = {
  generatePublicToken,
  isValidPublicToken,
};
