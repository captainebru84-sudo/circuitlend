require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC = process.env.MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const provider = new ethers.JsonRpcProvider(RPC);

// Monad testnet pins base fee at 100 gwei and reserves against maxFeePerGas far
// more aggressively than the tx's own gasLimit * maxFeePerGas. ethers defaults
// maxFeePerGas to 2x base (202 gwei), which the node rejects as "Signer had
// insufficient balance" even on a well-funded wallet. Quoting just above base
// here makes every write in the project inherit a fee the node accepts.
const baseFeeData = provider.getFeeData.bind(provider);
provider.getFeeData = async () => {
  const fee = await baseFeeData();
  const base = fee.gasPrice ?? ethers.parseUnits('100', 'gwei');
  return new ethers.FeeData(fee.gasPrice, (base * 115n) / 100n, ethers.parseUnits('1', 'gwei'));
};

function devWallet() {
  if (!process.env.DEV_WALLET_KEY) throw new Error('Set DEV_WALLET_KEY in .env');
  return new ethers.Wallet(process.env.DEV_WALLET_KEY, provider);
}

const BORROWER_FILE = path.join(__dirname, '..', 'borrower.json'); // gitignored

function borrowerWallet({ createIfMissing = false } = {}) {
  if (process.env.BORROWER_KEY) return new ethers.Wallet(process.env.BORROWER_KEY, provider);
  if (fs.existsSync(BORROWER_FILE)) {
    const j = JSON.parse(fs.readFileSync(BORROWER_FILE, 'utf8'));
    return new ethers.Wallet(j.privateKey, provider);
  }
  if (!createIfMissing) throw new Error('borrower.json missing — run 03_setup.js first');
  const w = ethers.Wallet.createRandom().connect(provider);
  fs.writeFileSync(BORROWER_FILE, JSON.stringify({ address: w.address, privateKey: w.privateKey }, null, 2));
  console.log('created borrower wallet', w.address, '(saved to borrower.json, gitignored)');
  return w;
}

const ERC20_ABI = [
  'function transfer(address,uint256) returns (bool)',
  'function transferFrom(address,address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function grantRole(bytes32,address)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function mint(address,uint256)',
];
const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('MINTER_ROLE'));

const POOL_ABI = [
  'function owner() view returns (address)',
  'function loanCount() view returns (uint256)',
  'function loans(uint256) view returns (address borrower, uint256 principal, uint256 outstanding, uint256 installment, uint256 collateral, uint64 leaseExpiry, uint64 leaseDuration, uint64 graceSeconds, bool enforced, bool closed)',
  'function fund(uint256)',
  'function openLoan(address,uint256,uint256,uint256,uint64,uint64) returns (uint256)',
  'function repay(uint256,uint256)',
  'function enforce(uint256)',
  'function enforceCompliance(uint256,string)',
  'function restore(uint256,uint64)',
  'function liquidate(uint256)',
  'function isPowered(uint256) view returns (bool)',
  'function leaseRemaining(uint256) view returns (uint256)',
  'event ComplianceReceipt(uint256 indexed loanId, string action, string detail, address actor, uint256 timestamp)',
];

const addr = {
  cldt01: () => process.env.CLDT01_ADDRESS,
  clusd: () => {
    if (!process.env.CLUSD_ADDRESS) throw new Error('Set CLUSD_ADDRESS in .env (run 01_launch_clusd.js)');
    return process.env.CLUSD_ADDRESS;
  },
  pool: () => {
    if (!process.env.POOL_ADDRESS) throw new Error('Set POOL_ADDRESS in .env (deploy contracts first)');
    return process.env.POOL_ADDRESS;
  },
};

const U = (n) => ethers.parseUnits(String(n), 6);
const fmt = (v) => ethers.formatUnits(v, 6);

const RECEIPTS_DIR = path.join(__dirname, '..', 'docs', 'receipts');

// Audit-ready compliance receipt: one JSON per action, pairing on-chain tx
// hashes with Cleanverse A-Pass state so an auditor can replay every event.
function writeReceipt(action, payload) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(RECEIPTS_DIR, `${stamp}_${action}.json`);
  fs.writeFileSync(file, JSON.stringify({ action, at: new Date().toISOString(), chain: 'monad-testnet', ...payload }, null, 2));
  console.log('receipt ->', path.relative(path.join(__dirname, '..'), file));
  return file;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Monad reserves gasLimit * maxFeePerGas up front, so a wallet with enough
// balance for the real cost can still be rejected. The node answers -32603
// "Signer had insufficient balance", which ethers v6 cannot map to a known
// error and reports as the useless "could not coalesce error".
function rpcError(e) {
  const nested = e?.error?.message || e?.info?.error?.message;
  const coalesced = String(e?.message || '').match(/error=\{[^}]*"message":\s*"([^"]+)"/)?.[1];
  return nested || coalesced || e?.shortMessage || e?.message || String(e);
}

// Monad reserves against maxFeePerGas, so a wallet with enough balance for the
// real cost can still be rejected. Surfaced as a preflight warning in the console.
async function gasHeadroom(address) {
  const [bal, fee] = await Promise.all([provider.getBalance(address), provider.getFeeData()]);
  const reserve = 400000n * fee.maxFeePerGas;
  return { balance: ethers.formatEther(bal), reservePerTx: ethers.formatEther(reserve), low: bal < reserve * 3n };
}

module.exports = {
  ethers, provider, devWallet, borrowerWallet,
  ERC20_ABI, POOL_ABI, MINTER_ROLE, addr, U, fmt, writeReceipt, sleep, rpcError, gasHeadroom,
};
