// Originate the demo loan. The device (a solar/USB appliance financed for the
// borrower) is collateralized by its CLDT01 note; principal is disbursed in CLUSD.
// Demo-friendly lease economics via CLI: node scripts/05_open_loan.js [leaseSecs] [graceSecs]
//   default: 120s lease per 10-CLUSD installment, 60s grace — watchable on camera.
const { ethers, devWallet, borrowerWallet, POOL_ABI, addr, U, fmt, writeReceipt } = require('./lib');

(async () => {
  const leaseSecs = Number(process.argv[2] || 120);
  const graceSecs = Number(process.argv[3] || 60);
  const dev = devWallet();
  const borrower = borrowerWallet();
  const pool = new ethers.Contract(addr.pool(), POOL_ABI, dev);

  let tx = await pool.fund(U(100));
  console.log('pool funded 100 CLUSD:', (await tx.wait()).hash);

  tx = await pool.openLoan(borrower.address, U(1), U(100), U(10), leaseSecs, graceSecs);
  const rc = await tx.wait();
  const loanId = await pool.loanCount();
  console.log(`loan #${loanId} opened:`, rc.hash);

  const l = await pool.loans(loanId);
  console.log('principal:', fmt(l.principal), 'CLUSD | installment:', fmt(l.installment),
    '| leaseExpiry:', new Date(Number(l.leaseExpiry) * 1000).toISOString(),
    '| grace:', Number(l.graceSeconds), 's');
  console.log('isPowered:', await pool.isPowered(loanId));
  writeReceipt('LOAN_OPENED', {
    loanId: Number(loanId), txHash: rc.hash, borrower: borrower.address,
    principal: fmt(l.principal), installment: fmt(l.installment),
    leaseSeconds: leaseSecs, graceSeconds: graceSecs,
    leaseExpiry: new Date(Number(l.leaseExpiry) * 1000).toISOString(),
  });
})().catch((e) => { console.error(e); process.exit(1); });
