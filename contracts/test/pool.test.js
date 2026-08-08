const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const U = (n) => ethers.parseUnits(String(n), 6);
const DAY = 24 * 3600;

async function warp(seconds) {
  await network.provider.send('evm_increaseTime', [seconds]);
  await network.provider.send('evm_mine');
}

describe('CircuitLendPool', () => {
  let lender, borrower, stranger, clusd, note, pool;

  beforeEach(async () => {
    [lender, borrower, stranger] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory('MockAToken');
    clusd = await Mock.deploy('CircuitLend USD', 'CLUSD');
    note = await Mock.deploy('CircuitLend Device Note T1', 'CLDT01');
    const Pool = await ethers.getContractFactory('CircuitLendPool');
    pool = await Pool.deploy(clusd.target, note.target);

    await clusd.mint(lender.address, U(1000));
    await clusd.mint(borrower.address, U(100)); // for repayments
    await note.mint(borrower.address, U(1)); // 1.000000 device note
    await clusd.connect(lender).approve(pool.target, U(1000));
    await clusd.connect(borrower).approve(pool.target, U(1000));
    await note.connect(borrower).approve(pool.target, U(1));
    await pool.fund(U(500));
  });

  const open = () =>
    pool.openLoan(borrower.address, U(1), U(100), U(10), 30 * DAY, 7 * DAY);

  it('originates: custodies device note, disburses principal', async () => {
    await expect(open()).to.emit(pool, 'LoanOpened');
    expect(await note.balanceOf(pool.target)).to.equal(U(1));
    expect(await clusd.balanceOf(borrower.address)).to.equal(U(200));
    expect(await pool.isPowered(1)).to.equal(true);
  });

  it('repayment extends the lease proportionally', async () => {
    await open();
    const before = (await pool.loans(1)).leaseExpiry;
    await pool.connect(borrower).repay(1, U(20)); // 2 installments
    const after = (await pool.loans(1)).leaseExpiry;
    expect(after - before).to.equal(BigInt(60 * DAY));
  });

  it('full repayment closes the loan and releases collateral; device stays powered forever', async () => {
    await open();
    await expect(pool.connect(borrower).repay(1, U(100))).to.emit(pool, 'LoanClosed');
    expect(await note.balanceOf(borrower.address)).to.equal(U(1));
    await warp(400 * DAY);
    expect(await pool.isPowered(1)).to.equal(true);
  });

  it('lapsed lease cuts power automatically — no transaction needed', async () => {
    await open();
    await warp(30 * DAY + 7 * DAY + 1);
    expect(await pool.isPowered(1)).to.equal(false);
  });

  it('enforce() is permissionless after expiry+grace, reverts before', async () => {
    await open();
    await expect(pool.connect(stranger).enforce(1)).to.be.revertedWithCustomError(pool, 'NotEnforceable');
    await warp(30 * DAY + 7 * DAY + 1);
    await expect(pool.connect(stranger).enforce(1))
      .to.emit(pool, 'ComplianceReceipt')
      .withArgs(1, 'ENFORCED', 'LEASE_DEFAULT', stranger.address, (v) => v > 0);
    expect((await pool.loans(1)).enforced).to.equal(true);
  });

  it('compliance kill-switch works even when payments are current', async () => {
    await open();
    await pool.connect(borrower).repay(1, U(10)); // current
    await expect(pool.enforceCompliance(1, 'CVI_REVOKED: issuer freeze'))
      .to.emit(pool, 'Enforced')
      .withArgs(1, 'CVI_REVOKED: issuer freeze');
    expect(await pool.isPowered(1)).to.equal(false);
    await expect(pool.connect(stranger).enforceCompliance(1, 'x')).to.be.revertedWithCustomError(pool, 'NotOwner');
  });

  it('restore clears the latch and grants lease time', async () => {
    await open();
    await pool.enforceCompliance(1, 'CVI_REVOKED');
    await pool.restore(1, 30 * DAY);
    expect(await pool.isPowered(1)).to.equal(true);
  });

  it('liquidation moves the device note to the lender after enforcement', async () => {
    await open();
    await warp(30 * DAY + 7 * DAY + 1);
    await pool.enforce(1);
    await pool.liquidate(1);
    expect(await note.balanceOf(lender.address)).to.equal(U(1));
  });

  it('a frozen borrower cannot repay — the A-Token itself reverts (CVI at token level)', async () => {
    await open();
    await clusd.setFrozen(borrower.address, true);
    await expect(pool.connect(borrower).repay(1, U(10))).to.be.revertedWithCustomError(clusd, 'APassNotActive');
  });

  it('leaseRemaining counts down to zero', async () => {
    await open();
    expect(await pool.leaseRemaining(1)).to.be.greaterThan(0);
    await warp(30 * DAY + 7 * DAY + 1);
    expect(await pool.leaseRemaining(1)).to.equal(0);
  });
});
