const { call, get, sleep } = require('./client');

// A-Token (CVA) — compliance-restricted ERC-20 issued through Cleanverse.
// Launch flow: launch -> poll status until ISSUED -> admin grants MINTER_ROLE on-chain -> mint.

async function launch({ chain = 'monad', name, symbol, decimals = 6, adminAddress, rule, icon, callbackUrl }) {
  const body = {
    chain,
    token_name: name,
    token_symbol: symbol,
    decimals,
    admin_address: adminAddress,
    rule,
    icon: icon || 'https://cleanverse.com/html-pages/hackathon/assets/RWA.png',
  };
  if (callbackUrl) body.callback_url = callbackUrl;
  return call('/atoken/launch', body, { encrypted: true });
}

async function queryApplyStatus(requestId) {
  return get(`/atoken/query_apply_status/${requestId}`);
}

// Sandbox approval is near-instant (~4s); poll until ISSUED or timeout.
// Transient network failures are retried, not fatal.
async function waitForIssued(requestId, { timeoutMs = 120000, intervalMs = 4000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await queryApplyStatus(requestId);
      const status = last?.data?.applyStatus || last?.data?.status;
      if (String(status).toUpperCase().includes('ISSUED')) return last;
    } catch (e) {
      console.log('  status poll retry:', e.cause?.code || e.message);
    }
    await sleep(intervalMs);
  }
  throw new Error(`A-Token ${requestId} not ISSUED within ${timeoutMs}ms: ${JSON.stringify(last)}`);
}

async function depositTokenList(chain = 'monad') {
  return call('/query_deposit_atoken_list', { chain }, { encrypted: false });
}

module.exports = { launch, queryApplyStatus, waitForIssued, depositTokenList };
