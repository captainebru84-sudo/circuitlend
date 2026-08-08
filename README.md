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
- `docs/` — one-pager, LTV table, compliance-receipt spec
- `demo/` — demo script + video

## Status

Built during the hackathon window, Aug 8–9 2026. This README is updated as phases land.
