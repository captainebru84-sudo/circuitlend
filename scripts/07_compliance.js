// The headline flow: CVI revocation triggers physical enforcement even when
// payments are current.
//   node scripts/07_compliance.js freeze [loanId] [reason...]
//     -> freeze borrower A-Pass (Cleanverse /update_status) + latch the pool
//        (enforceCompliance). Device cuts power via its own on-chain probes.
//   node scripts/07_compliance.js restore [loanId] [leaseSecs]
//     -> unfreeze A-Pass + clear the latch, lease extended.
// Every action lands an audit receipt pairing API state with tx hashes.
const { apass } = require('../sdk');
const { ethers, devWallet, borrowerWallet, POOL_ABI, addr, writeReceipt } = require('./lib');

(async () => {
  const mode = process.argv[2];
  const loanId = Number(process.argv[3] || 1);
  const dev = devWallet();
  const borrower = borrowerWallet();
  const pool = new ethers.Contract(addr.pool(), POOL_ABI, dev);

  if (mode === 'freeze') {
    const reason = process.argv.slice(4).join(' ') || 'Issuer compliance revocation (demo)';
    console.log('1) freezing borrower A-Pass:', borrower.address);
    const f = await apass.freeze({ address: borrower.address, chain: 'monad', reason });
    console.log('   confirmed frozen:', f.isFrozen, '(mutation code:', f.mutation?.code + ')');

    console.log('2) latching pool enforcement (payments may be fully current):');
    const tx = await pool.enforceCompliance(loanId, 'CVI_REVOKED: ' + reason);
    const rc = await tx.wait();
    console.log('   enforceCompliance tx:', rc.hash);
    console.log('   isPowered:', await pool.isPowered(loanId));

    writeReceipt('ENFORCED_CVI_REVOCATION', {
      loanId, reason, borrower: borrower.address,
      apassFrozenConfirmed: f.isFrozen, apassState: f.confirmed?.data,
      enforceTxHash: rc.hash,
    });
    console.log('\nThe breaker will open within ~10s — the device sees APassNotActive on-chain itself.');
  } else if (mode === 'restore') {
    const leaseSecs = Number(process.argv[4] || 300);
    console.log('1) reinstating borrower A-Pass:', borrower.address);
    const u = await apass.unfreeze({ address: borrower.address, chain: 'monad' });
    console.log('   confirmed active:', u.isActive);

    console.log('2) clearing pool latch, extending lease', leaseSecs, 's:');
    const tx = await pool.restore(loanId, leaseSecs);
    const rc = await tx.wait();
    console.log('   restore tx:', rc.hash);
    console.log('   isPowered:', await pool.isPowered(loanId));

    writeReceipt('RESTORED', {
      loanId, borrower: borrower.address,
      apassActiveConfirmed: u.isActive, restoreTxHash: rc.hash, leaseSecondsGranted: leaseSecs,
    });
  } else {
    console.log('usage: node scripts/07_compliance.js freeze|restore [loanId] [reason|leaseSecs]');
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
