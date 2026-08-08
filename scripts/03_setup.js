// One-time actor setup after CLUSD launch + pool deploy:
//   1. grant MINTER_ROLE(dev) on CLUSD, mint lender liquidity + borrower dust
//   2. create borrower wallet, gas it with MON
//   3. issue A-Passes: borrower AND the pool contract itself (the pool custodies
//      A-Tokens, so it must be a compliant holder too)
//   4. mint the CLDT01 device note to the borrower (the financed hardware)
//   5. approvals for pool custody + repayments
const { apass } = require('../sdk');
const { ethers, devWallet, borrowerWallet, ERC20_ABI, MINTER_ROLE, addr, U, fmt, writeReceipt, sleep } = require('./lib');

(async () => {
  const dev = devWallet();
  const borrower = borrowerWallet({ createIfMissing: true });
  const pool = addr.pool();
  console.log('dev(lender):', dev.address, '| borrower:', borrower.address, '| pool:', pool);
  console.log('dev MON:', ethers.formatEther(await dev.provider.getBalance(dev.address)));

  const clusd = new ethers.Contract(addr.clusd(), ERC20_ABI, dev);
  const note = new ethers.Contract(addr.cldt01(), ERC20_ABI, dev);

  // A-Passes first — mints/transfers revert without them
  const expiry = Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
  let issuedNew = false;
  for (const [label, customerId, address] of [
    ['borrower', 'CIRCUITLENDBORROWER01', borrower.address],
    ['pool', 'CIRCUITLENDPOOLCT01', pool],
  ]) {
    const existing = await apass.query({ address });
    if (existing?.data?.tier) {
      console.log(`A-Pass ${label}: already exists (tier ${existing.data.tier}, status ${existing.data.status})`);
      continue;
    }
    const res = await apass.generate({
      customerId, address, chain: 'monad', expirationTime: expiry,
      identityDataList: [{
        idType: 'ID_CARD',
        fullName: `CircuitLend Demo ${label}`,
        idNumber: 'CL' + Date.now(),
        validUntil: '2030-12-31',
        issuingCountryISO2: 'NG',
      }],
    });
    console.log(`A-Pass ${label}:`, JSON.stringify(res?.data || res));
    if (res?.code !== '0000') throw new Error(`A-Pass generation failed for ${label}`);
    issuedNew = true;
    writeReceipt(`APASS_ISSUED_${label.toUpperCase()}`, { address, customerId, response: res });
    await sleep(4000);
  }
  if (issuedNew) {
    console.log('waiting 15s for on-chain A-Pass registration...');
    await sleep(15000);
  }

  // MINTER_ROLE on CLUSD (dev already holds it on CLDT01 from issuance admin)
  if (!(await clusd.hasRole(MINTER_ROLE, dev.address))) {
    const tx = await clusd.grantRole(MINTER_ROLE, dev.address);
    console.log('grant MINTER_ROLE on CLUSD:', (await tx.wait()).hash);
  }

  // Lender liquidity + borrower repayment budget (plus probe dust)
  let tx = await clusd.mint(dev.address, U(1000));
  console.log('mint 1000 CLUSD -> lender:', (await tx.wait()).hash);
  tx = await clusd.mint(borrower.address, U(50));
  console.log('mint 50 CLUSD -> borrower (repayment budget):', (await tx.wait()).hash);

  // Device note: the financed asset, issued to the borrower at origination
  tx = await note.mint(borrower.address, U(1));
  console.log('mint 1.000000 CLDT01 -> borrower:', (await tx.wait()).hash);

  // Gas for borrower approvals + repayments
  if ((await dev.provider.getBalance(borrower.address)) < ethers.parseEther('0.05')) {
    tx = await dev.sendTransaction({ to: borrower.address, value: ethers.parseEther('0.1') });
    console.log('gas 0.1 MON -> borrower:', (await tx.wait()).hash);
  }

  // Approvals
  tx = await clusd.approve(addr.pool(), U(1000));
  console.log('lender approve CLUSD -> pool:', (await tx.wait()).hash);
  tx = await clusd.connect(borrower).approve(addr.pool(), U(1000));
  console.log('borrower approve CLUSD -> pool:', (await tx.wait()).hash);
  tx = await note.connect(borrower).approve(addr.pool(), U(1));
  console.log('borrower approve CLDT01 -> pool:', (await tx.wait()).hash);

  console.log('\nbalances: lender', fmt(await clusd.balanceOf(dev.address)), 'CLUSD | borrower',
    fmt(await clusd.balanceOf(borrower.address)), 'CLUSD +', fmt(await note.balanceOf(borrower.address)), 'CLDT01');
  writeReceipt('ACTORS_READY', { lender: dev.address, borrower: borrower.address, pool });
})().catch((e) => { console.error(e); process.exit(1); });
