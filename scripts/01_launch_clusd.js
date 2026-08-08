// Launch CLUSD — CircuitLend's settlement A-Token on Monad.
// (The shared testnet faucet on monad is unfunded — reported to Cleanverse —
// so we issue our own compliance-restricted settlement rail. Deeper CVA
// integration anyway: BOTH the device note and the money leg are A-Tokens.)
const { atoken } = require('../sdk');
const { devWallet, writeReceipt } = require('./lib');

(async () => {
  const admin = devWallet().address;
  console.log('launching CLUSD, admin =', admin);
  const res = await atoken.launch({
    chain: 'monad',
    name: 'CircuitLend Settlement USD',
    symbol: 'CLUSD',
    decimals: 6,
    adminAddress: admin,
    rule: { min_tier: 30 },
  });
  console.log('launch response:', JSON.stringify(res, null, 2));
  const requestId = res?.data?.requestId || res?.data?.request_id;
  if (!requestId) throw new Error('no request id in launch response');

  const issued = await atoken.waitForIssued(requestId);
  console.log('ISSUED:', JSON.stringify(issued, null, 2));
  const d = issued.data || {};
  const address = d.atokenAddress || d.contract_address || d.address || null;
  writeReceipt('CLUSD_LAUNCHED', { requestId, launch: res, issued });
  console.log('\nCLUSD address:', address);
  console.log('-> set CLUSD_ADDRESS in .env, then deploy the pool:');
  console.log('   cd contracts && npx hardhat run scripts/deploy.js --network monad');
})().catch((e) => { console.error(e); process.exit(1); });
