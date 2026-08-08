// CircuitLend lender console — runs locally for the desk demo and on Vercel
// as the live URL. All Cleanverse calls stay server-side (api-key never
// reaches the browser). Testnet-only keys; no auth by design (demo).
const express = require('express');
const path = require('path');
const { apass, validator } = require('../sdk');
const { ethers, provider, devWallet, borrowerWallet, POOL_ABI, ERC20_ABI, addr, U, fmt } = require('../scripts/lib');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = () => new ethers.Contract(addr.pool(), POOL_ABI, provider);

app.get('/api/state', async (req, res) => {
  try {
    const loanId = Number(req.query.loanId || 1);
    const p = pool();
    const clusd = new ethers.Contract(addr.clusd(), ERC20_ABI, provider);
    const note = new ethers.Contract(addr.cldt01(), ERC20_ABI, provider);
    const borrower = borrowerWallet();

    const [l, powered, remaining, ap, val, borClusd, poolClusd, poolNote, count] = await Promise.all([
      p.loans(loanId),
      p.isPowered(loanId),
      p.leaseRemaining(loanId),
      apass.query({ address: borrower.address }),
      validator.verify({ chain: 'monad', contractAddress: addr.pool(), userAddress: borrower.address }),
      clusd.balanceOf(borrower.address),
      clusd.balanceOf(addr.pool()),
      note.balanceOf(addr.pool()),
      p.loanCount(),
    ]);
    res.json({
      loanId,
      loanCount: Number(count),
      loan: {
        borrower: l.borrower,
        principal: fmt(l.principal),
        outstanding: fmt(l.outstanding),
        installment: fmt(l.installment),
        collateral: fmt(l.collateral),
        leaseExpiry: Number(l.leaseExpiry),
        graceSeconds: Number(l.graceSeconds),
        enforced: l.enforced,
        closed: l.closed,
      },
      isPowered: powered,
      leaseRemaining: Number(remaining),
      apass: {
        address: borrower.address,
        tier: ap?.data?.tier ?? null,
        status: String(ap?.data?.status ?? ''),
        frozen: String(ap?.data?.status) === '2',
      },
      validator: val?.data || val,
      balances: { borrowerCLUSD: fmt(borClusd), poolCLUSD: fmt(poolClusd), poolCLDT01: fmt(poolNote) },
      addresses: { pool: addr.pool(), clusd: addr.clusd(), cldt01: addr.cldt01() },
      now: Math.floor(Date.now() / 1000),
    });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

// Receipts feed: Monad public RPC caps eth_getLogs at 100 blocks, so a full
// historical scan is impractical. Merge the committed audit JSONs (history)
// with an incremental live scanner that follows the chain head.
const fs = require('fs');
const RECEIPTS_DIR = path.join(__dirname, '..', 'docs', 'receipts');
const liveReceipts = [];
let cursor = null;

function fileReceipts() {
  try {
    return fs.readdirSync(RECEIPTS_DIR).filter((f) => f.endsWith('.json')).map((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(RECEIPTS_DIR, f), 'utf8'));
      const flat = JSON.stringify(j);
      const tx = (flat.match(/0x[0-9a-fA-F]{64}/) || [null])[0];
      return {
        loanId: j.loanId || 0,
        action: j.action,
        detail: j.reason || j.tokenSymbol || '',
        actor: 'script',
        timestamp: Math.floor(new Date(j.at).getTime() / 1000),
        txHash: tx,
        source: 'audit-file',
      };
    });
  } catch {
    return [];
  }
}

async function scanChain() {
  const p = pool();
  const latest = await provider.getBlockNumber();
  if (cursor === null) cursor = latest - 250;
  while (cursor < latest) {
    const to = Math.min(cursor + 99, latest);
    const events = await p.queryFilter(p.filters.ComplianceReceipt(), cursor + 1, to);
    for (const ev of events) {
      liveReceipts.push({
        loanId: Number(ev.args.loanId),
        action: ev.args.action,
        detail: ev.args.detail,
        actor: ev.args.actor,
        timestamp: Number(ev.args.timestamp),
        txHash: ev.transactionHash,
        source: 'chain',
      });
    }
    cursor = to;
  }
}

app.get('/api/receipts', async (req, res) => {
  try {
    await scanChain();
    const seen = new Set();
    const all = [...liveReceipts, ...fileReceipts()]
      .filter((r) => {
        const key = r.txHash || r.action + r.timestamp;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 60);
    res.json(all);
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

app.post('/api/action', async (req, res) => {
  try {
    const { type, loanId = 1 } = req.body;
    const dev = devWallet();
    const borrower = borrowerWallet();
    const p = pool();
    let result;

    if (type === 'freeze') {
      const f = await apass.freeze({ address: borrower.address, reason: req.body.reason || 'Compliance revocation (console)' });
      const tx = await p.connect(dev).enforceCompliance(loanId, 'CVI_REVOKED: ' + (req.body.reason || 'console action'));
      result = { apassFrozen: f.isFrozen, enforceTx: (await tx.wait()).hash };
    } else if (type === 'restore') {
      const u = await apass.unfreeze({ address: borrower.address });
      const tx = await p.connect(dev).restore(loanId, Number(req.body.leaseSeconds || 120));
      result = { apassActive: u.isActive, restoreTx: (await tx.wait()).hash };
    } else if (type === 'repay') {
      const tx = await p.connect(borrower).repay(loanId, U(Number(req.body.amount || 10)));
      result = { repayTx: (await tx.wait()).hash };
    } else if (type === 'enforce') {
      const tx = await p.connect(dev).enforce(loanId);
      result = { enforceTx: (await tx.wait()).hash };
    } else {
      return res.status(400).json({ error: 'unknown action ' + type });
    }
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`CircuitLend console -> http://localhost:${port}`));
}
module.exports = app;
