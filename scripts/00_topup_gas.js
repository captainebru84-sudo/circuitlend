// Pre-demo gas check: node scripts/00_topup_gas.js [amountMON]
// Monad reserves against maxFeePerGas, so top the borrower up before filming.
const { ethers, provider, devWallet, borrowerWallet, gasHeadroom } = require('./lib');

(async () => {
  const dev = devWallet();
  const borrower = borrowerWallet();
  const head = await gasHeadroom(borrower.address);
  console.log('borrower', borrower.address, head.balance, 'MON | reserve/tx', head.reservePerTx, '| low:', head.low);
  console.log('dev     ', dev.address, ethers.formatEther(await provider.getBalance(dev.address)), 'MON');

  const amount = process.argv[2];
  if (!amount) return console.log(head.low ? 'LOW — rerun with an amount, e.g. 00_topup_gas.js 1.0' : 'headroom OK');
  const tx = await dev.sendTransaction({ to: borrower.address, value: ethers.parseEther(amount) });
  await tx.wait();
  console.log('sent', amount, 'MON ->', tx.hash);
  console.log('borrower now', ethers.formatEther(await provider.getBalance(borrower.address)), 'MON');
})().catch((e) => { console.error(require('./lib').rpcError(e)); process.exit(1); });
