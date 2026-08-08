const { call, sleep } = require('./client');

// A-Pass (CVI) — Cleanverse verified identity credential.
// customerId: >=12 alphanumeric chars. tier gates access to compliance-ruled tokens/pools.

async function generate({ customerId, address, chain = 'monad', expirationTime, tier, subTier, group, subGroup, identityDataList }) {
  const body = { customerId, expirationTime, wallet: { address, chain } };
  if (tier !== undefined) body.tier = tier;
  if (subTier !== undefined) body.subTier = subTier;
  if (group !== undefined) body.group = group;
  if (subGroup !== undefined) body.subGroup = subGroup;
  if (identityDataList !== undefined) body.identityDataList = identityDataList;
  return call('/generate_apass', body, { encrypted: true });
}

async function query({ address, chain = 'monad' }) {
  return call('/query_apass', { chain, address }, { encrypted: false });
}

async function verify({ address, atoken, chain = 'monad' }) {
  return call('/verify_apass', { chain, atoken, address }, { encrypted: false });
}

// status: '1' = activate, '2' = freeze.
// KNOWN QUIRK: freeze sometimes returns `0002 [500]System Error` while the state
// DID change — never trust the mutation response, always confirm via query.
async function setStatus({ address, chain = 'monad', freeze, reason }) {
  const body = { status: freeze ? '2' : '1', wallet: { chain, address } };
  if (freeze && reason) body.blacklistReason = reason;
  const res = await call('/update_status', body, { encrypted: true });
  await sleep(3000);
  const confirmed = await query({ address, chain });
  const status = confirmed?.data?.status;
  return { mutation: res, confirmed, isFrozen: String(status) === '2', isActive: String(status) === '1' };
}

const freeze = (opts) => setStatus({ ...opts, freeze: true });
const unfreeze = (opts) => setStatus({ ...opts, freeze: false });

module.exports = { generate, query, verify, setStatus, freeze, unfreeze };
