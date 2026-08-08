// Register the deployed pool with the Cleanverse APass Compliance Validator (CCP)
// and set the lending policy: min tier 30. Policy is live-editable later via
// validator.setRule — the lender can tighten pool compliance without redeploying.
const { validator } = require('../sdk');
const { devWallet, addr, writeReceipt, sleep } = require('./lib');

(async () => {
  const dev = devWallet();
  const pool = addr.pool();
  const rule = validator.makeRule({ minTier: 30 });

  const sig = await validator.signOwnership(dev, { chain: 'monad', contractAddress: pool });
  console.log('registering pool', pool, 'with rule', JSON.stringify(rule));
  const reg = await validator.register({ chain: 'monad', contractAddress: pool, rule, ownerSignature: sig });
  console.log('register:', JSON.stringify(reg));

  for (let i = 0; i < 10; i++) {
    await sleep(6000);
    const r = await validator.isRegistered({ chain: 'monad', contractAddress: pool });
    console.log('is_register:', JSON.stringify(r?.data || r));
    if (r?.data?.registered) break;
  }

  const devCheck = await validator.verify({ chain: 'monad', contractAddress: pool, userAddress: dev.address });
  console.log('verify lender (expect valid=true):', JSON.stringify(devCheck?.data || devCheck));
  writeReceipt('POOL_REGISTERED_VALIDATOR', { pool, rule, register: reg, verifyLender: devCheck });
})().catch((e) => { console.error(e); process.exit(1); });
