const { ethers } = require('hardhat');

async function main() {
  const clusd = process.env.CLUSD_ADDRESS;
  const note = process.env.CLDT01_ADDRESS;
  if (!clusd || !note) throw new Error('Set CLUSD_ADDRESS and CLDT01_ADDRESS in .env');

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log('network:', net.name, net.chainId.toString(), '| deployer:', deployer.address);
  console.log('settlement (CLUSD):', clusd, '| deviceNote (CLDT01):', note);

  const Pool = await ethers.getContractFactory('CircuitLendPool');
  const pool = await Pool.deploy(clusd, note);
  await pool.waitForDeployment();
  console.log('CircuitLendPool deployed:', pool.target);
  console.log('-> put this in .env as POOL_ADDRESS and firmware/config.py as POOL_ADDRESS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
