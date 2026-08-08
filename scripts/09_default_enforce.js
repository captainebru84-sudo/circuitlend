// Missed-payment path: once lease+grace lapse the device is ALREADY dark
// (isPowered went false automatically, no transaction needed). enforce() is the
// permissionless latch that puts the default on the record and unlocks
// liquidation.  node scripts/09_default_enforce.js [loanId] [--liquidate]
const { ethers, devWallet, POOL_ABI, addr, fmt, writeReceipt } = require('./lib');

(async () => {
  const loanId = Number(process.argv[2] || 1);
  const dev = devWallet();
  const pool = new ethers.Contract(addr.pool(), POOL_ABI, dev);

  console.log('isPowered before enforce:', await pool.isPowered(loanId),
    '| leaseRemaining:', Number(await pool.leaseRemaining(loanId)), 's');

  const tx = await pool.enforce(loanId);
  const rc = await tx.wait();
  console.log('enforce (LEASE_DEFAULT) tx:', rc.hash);
  writeReceipt('ENFORCED_LEASE_DEFAULT', { loanId, txHash: rc.hash });

  if (process.argv.includes('--liquidate')) {
    const l = await pool.loans(loanId);
    const tx2 = await pool.liquidate(loanId);
    const rc2 = await tx2.wait();
    console.log('liquidate tx:', rc2.hash, '| device note ->', dev.address, `(${fmt(l.collateral)} CLDT01)`);
    writeReceipt('LIQUIDATED', { loanId, txHash: rc2.hash, collateral: fmt(l.collateral) });
  }
})().catch((e) => { console.error(e); process.exit(1); });
