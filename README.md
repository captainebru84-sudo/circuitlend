# CircuitLend

**Hardware-enforced RWA lending on Monad — when compliance is revoked, the collateral physically shuts off.**

Built for the Cleanverse *Build Trusted Assets* Hackathon (RWA track) by **Breaker Labs**.

## The one-liner

Off-grid hardware (solar kits, appliances, tools) is financed across emerging markets, but lenders have no recourse that doesn't involve repossession agents. CircuitLend puts the loan's enforcement switch **inside the asset itself**: an ESP32 circuit breaker that reads Monad directly and fails closed. A revoked Cleanverse A-Pass (CVI) or a lapsed lease cuts power to the device — **even if payments are current, compliance revocation triggers physical enforcement**.

## CVI · CVA integration map

| Cleanverse primitive | Where it's load-bearing in CircuitLend |
|---|---|
| **A-Pass (CVI)** | Borrower onboarding, mint/transfer gating on every token, and the *live enforcement trigger*: freezing an A-Pass reverts transfers on-chain, and the device detects `APassNotActive` within seconds |
| **A-Token (CVA) — CLDT01 device note** | The financed hardware is issued as a compliance-restricted ERC-20 note from day one; it cannot move to a non-compliant wallet |
| **A-Token (CVA) — CLUSD settlement** | Loan disbursement and repayments ride verified-stablecoin rails; both legs of every payment are compliance-checked at the contract level |
| **Validator Compliance (CCP)** | The lending pool contract is registered with the APass Compliance Validator; pool policy (min tier, groups, country lists) is live-editable by the lender |
| **Compliance receipts** | Every enforcement action emits an on-chain `ComplianceReceipt` event and an audit-ready JSON record with tx hashes and A-Pass record IDs |

## Architecture

```
Lender dashboard ──► Cleanverse API (A-Pass freeze / query / validator rules)
       │                        │
       ▼                        ▼
CircuitLendPool.sol ◄──── Monad testnet ◄──── ESP32 breaker (polls chain directly,
 (loans, lease TTL,                            no server, no push commands,
  enforce, receipts)                           fail-closed relay)
```

The device receives **zero commands**. It polls Monad over TLS, simulates a transfer to detect A-Pass state, reads its lease expiry from the pool, and opens the relay when either check fails. Power loss, crash, or network loss all fail closed after the lease TTL grace period.

## Repo layout

- `sdk/` — Cleanverse cooperate-API client (AES-256-CBC envelope, A-Pass, A-Token, validator, faucet)
- `contracts/` — `CircuitLendPool.sol` + tests (Hardhat)
- `scripts/` — end-to-end demo flow: onboard → issue device note → loan → repay → default → enforce
- `firmware/` — ESP32 MicroPython breaker firmware
- `dashboard/` — lender console (live demo)
- `docs/` — [one-pager](docs/ONE_PAGER.md) and audit-ready compliance receipts
- `demo/` — demo script + video

## Deployed on Monad testnet (chainId 10143)

| Contract | Address |
|---|---|
| CircuitLendPool | `0x5538b0CF2f97e73cedD6349Ef50E299A95B70DdF` |
| CLUSD settlement A-Token (CVA) | `0x09A050Eb813ddb0b1EEAE7bca83bc1becD04FA31` |
| CLDT01 device note A-Token (CVA) | `0x4727a40d36cDa8505c42caFaAD262BCF22ABaEEb` |

Borrower A-Pass `cvRecordId 1258` (tier 50) · Pool A-Pass `cvRecordId 1259` · pool registered with the APass Compliance Validator at `min_tier 30`.

## Run it

```bash
npm install
cp .env.example .env          # Cleanverse api-id/api-key, DEV_WALLET_KEY, deployed addresses

cd contracts && npx hardhat test && cd ..   # 10/10

node scripts/03_setup.js       # A-Passes for borrower + pool, device note minted
node scripts/04_register_validator.js
node scripts/05_open_loan.js   # originate: custody note, disburse CLUSD
node scripts/06_repay.js 2 10  # repay — extends the lease
node scripts/07_compliance.js  # freeze A-Pass -> device loses power while current
node scripts/08_status.js      # loan, lease, A-Pass and validator state
node scripts/09_default_enforce.js

node dashboard/server.js       # lender console -> http://localhost:3000
```

Firmware: set `LOAN_ID` in `firmware/config.py`, then
`mpremote connect COM7 fs cp firmware/config.py :config.py + fs cp firmware/main.py :main.py`.

## What's verified live

- **Full loan lifecycle on Monad**: originate → repay → CVI freeze while payments current → restore → natural lease lapse → permissionless `enforce` → `liquidate`. Receipts in `docs/receipts/`.
- **Compliance enforced at token level, not in our code**: mint and transfer both revert `NoAPass(address)` / `APassNotActive(address)` — our own scripts fail exactly as a third party's would.
- **Freeze propagates to hardware in ~10s**: A-Pass frozen via the Cleanverse API → ESP32 detects it by reading Monad itself → relay opens. Zero commands sent to the device.
- **Validator rules are live**: raising the pool's `min_tier` above the borrower's tier flips them to invalid within ~10s, and back on restore.
- Contract tests: **10/10** (Hardhat).

## Notes for reviewers

- **Fail-closed by design.** The relay is active-high: GPIO low, a crash, or a power cut all release it. The device defaults to *off*, never to *on*.
- **Grace window.** The breaker keeps last-known-good state through brief RPC/WiFi outages and only then fails closed, so a flaky network doesn't strand a paying borrower.
- **Monad gas quirk.** Monad reserves against `maxFeePerGas` far more aggressively than `gasLimit * maxFeePerGas`, and ethers quotes 2× base fee — which the node rejects as "Signer had insufficient balance" on a well-funded wallet. `scripts/lib.js` caps the quote just above base fee provider-wide.
- Testnet keys only; the console has no auth by design (demo), and all Cleanverse calls stay server-side so the api-key never reaches the browser.

## Status

Built during the hackathon window, Aug 8–9 2026, by **Breaker Labs**.
