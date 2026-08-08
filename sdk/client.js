require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');

const BASE = process.env.CLEANVERSE_API_BASE || 'https://uatapi.cleanverse.com/api/cooperate';
const API_ID = process.env.CLEANVERSE_API_ID;
const KEY = process.env.CLEANVERSE_API_KEY ? Buffer.from(process.env.CLEANVERSE_API_KEY, 'base64') : null;

function assertConfigured() {
  if (!API_ID || !KEY) throw new Error('Set CLEANVERSE_API_ID and CLEANVERSE_API_KEY in .env (see .env.example)');
}

// Cleanverse envelope: AES-256-CBC, zero IV, PKCS7, key = base64-decoded api-key
function encrypt(obj) {
  assertConfigured();
  const c = crypto.createCipheriv('aes-256-cbc', KEY, Buffer.alloc(16, 0));
  return Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]).toString('base64');
}

async function call(path, body, { encrypted = false } = {}) {
  assertConfigured();
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-id': API_ID,
      'X-Request-ID': crypto.randomUUID(),
    },
    body: JSON.stringify(encrypted ? { data: encrypt(body) } : body),
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, http: r.status };
  }
}

async function get(path) {
  assertConfigured();
  const r = await fetch(BASE + path, { headers: { 'api-id': API_ID } });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, http: r.status };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { call, get, encrypt, sleep, BASE };
