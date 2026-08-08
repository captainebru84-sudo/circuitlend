// Borrower repays: node scripts/06_repay.js [loanId] [amount]
// Each full installment extends the lease — the physical power entitlement.
const { ethers, borrowerWallet, POOL_ABI, addr, U, fmt, writeReceipt } = require('./lib');

(async () => {
  const loanId = Number(process.argv[2] || 1);
  const amount = Number(process.argv[3] || 10);
  const borrower = borrowerWallet();
  const pool = new ethers.Contract(addr.pool(), POOL_ABI, borrower);

  const before = await pool.loans(loanId);
  const tx = await pool.repay(loanId, U(amount));
  const rc = await tx.wait();
  const after = await pool.loans(loanId);

  console.log(`repaid ${amount} CLUSD on loan #${loanId}:`, rc.hash);
  console.log('outstanding:', fmt(before.outstanding), '->', fmt(after.outstanding));
  console.log('leaseExpiry:', new Date(Number(before.leaseExpiry) * 1000).toISOString(),
    '->', new Date(Number(after.leaseExpiry) * 1000).toISOString());
  console.log('isPowered:', await pool.isPowered(loanId), '| leaseRemaining:', Number(await pool.leaseRemaining(loanId)), 's');
  writeReceipt('PAYMENT', {
    loanId, amount, txHash: rc.hash,
    outstanding: fmt(after.outstanding),
    newLeaseExpiry: new Date(Number(after.leaseExpiry) * 1000).toISOString(),
  });
})().catch((e) => { console.error(e); process.exit(1); });
