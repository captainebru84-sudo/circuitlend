// Live status: loan state, physical power entitlement, A-Pass + validator state.
// node scripts/08_status.js [loanId]
const { apass, validator } = require('../sdk');
const { ethers, devWallet, borrowerWallet, POOL_ABI, ERC20_ABI, addr, fmt } = require('./lib');

(async () => {
  const loanId = Number(process.argv[2] || 1);
  const dev = devWallet();
  const borrower = borrowerWallet();
  const pool = new ethers.Contract(addr.pool(), POOL_ABI, dev.provider);
  const clusd = new ethers.Contract(addr.clusd(), ERC20_ABI, dev.provider);

  const l = await pool.loans(loanId);
  console.log(`── loan #${loanId} ──`);
  console.log('borrower:      ', l.borrower);
  console.log('outstanding:   ', fmt(l.outstanding), '/', fmt(l.principal), 'CLUSD');
  console.log('collateral:    ', fmt(l.collateral), 'CLDT01 in custody');
  console.log('leaseExpiry:   ', new Date(Number(l.leaseExpiry) * 1000).toISOString(), `(+${Number(l.graceSeconds)}s grace)`);
  console.log('enforced:      ', l.enforced, '| closed:', l.closed);
  console.log('leaseRemaining:', Number(await pool.leaseRemaining(loanId)), 's');
  console.log('isPowered:     ', await pool.isPowered(loanId), ' <- what the breaker reads');

  const ap = await apass.query({ address: borrower.address });
  const d = ap?.data || {};
  console.log('\n── borrower A-Pass (CVI) ──');
  console.log('tier:', d.tier, '| status:', d.status, String(d.status) === '2' ? '(FROZEN)' : '(active)', '| expiry:', d.expirationTime || d.expiry);

  const v = await validator.verify({ chain: 'monad', contractAddress: addr.pool(), userAddress: borrower.address });
  console.log('\n── validator (CCP) ──');
  console.log('pool policy check for borrower:', JSON.stringify(v?.data || v));

  console.log('\n── balances ──');
  console.log('borrower CLUSD:', fmt(await clusd.balanceOf(borrower.address)));
  console.log('pool CLUSD:    ', fmt(await clusd.balanceOf(addr.pool())));
})().catch((e) => { console.error(e); process.exit(1); });
