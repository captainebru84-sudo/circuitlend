# CircuitLend — one-page summary

**Team:** Breaker Labs · **Track:** RWA · **Chain:** Monad testnet (chainId 10143)
**Repo:** https://github.com/captainebru84-sudo/circuitlend

---

## Problem

Productive hardware — solar kits, freezers, sewing machines, power tools — is financed on credit across emerging markets, but the lender's only recourse after default is a repossession agent. Recovery is slow, expensive, and often uneconomic relative to the asset, so lenders either refuse the loan or price it at rates that exclude the borrower.

Tokenising the asset does not fix this. An RWA token can be seized on-chain while the physical device keeps running in the borrower's shop. **The token and the hardware fall out of sync at exactly the moment enforcement matters.**

There is a second, sharper gap: when a regulator or issuer revokes a borrower's compliance credential, existing RWA systems can freeze the *token* but have no way to reach the *asset*.

## Solution

CircuitLend puts the enforcement switch **inside the financed device**. An ESP32 relay sits in the device's power line and polls Monad directly over TLS. It opens the circuit when either condition fails:

1. **Lease lapsed** — each repayment extends a lease TTL. Stop paying, and power cuts automatically once the grace window passes. No transaction, no server, no command.
2. **Compliance revoked** — if the borrower's Cleanverse A-Pass is frozen, the device detects it on-chain within seconds and cuts power **even if payments are current**.

The device receives **zero commands**. It reads chain state itself, so there is no centralised oracle to trust or attack, and it **fails closed** on power loss, crash, or network outage.

## CVI · CVA integration points

Both primitives are load-bearing from the issuance stage, not bolted on at onboarding.

| Primitive | Role | Live artefact |
|---|---|---|
| **A-Pass (CVI)** | Onboarding *and* the live enforcement trigger. Freezing reverts every token movement on-chain (`APassNotActive`), which the device reads as its cut signal. | Borrower `cvRecordId 1258` (tier 50), pool `cvRecordId 1259` |
| **A-Token (CVA) — CLDT01** | The financed device is issued as a compliance-restricted note from day one; it cannot move to a non-compliant wallet. | `0x4727a40d36cDa8505c42caFaAD262BCF22ABaEEb` |
| **A-Token (CVA) — CLUSD** | Disbursement and every repayment ride verified-stablecoin rails; both legs compliance-checked at token level. | `0x09A050Eb813ddb0b1EEAE7bca83bc1becD04FA31` |
| **Validator Compliance (CCP)** | The pool contract is registered with the APass Compliance Validator; pool policy (min tier, groups, countries) is live-editable by the lender. | Pool `0x5538b0CF2f97e73cedD6349Ef50E299A95B70DdF`, `min_tier 30` |
| **Compliance receipts** | Every state change emits an on-chain `ComplianceReceipt` plus an audit-ready JSON pairing tx hashes with A-Pass record IDs. | `docs/receipts/` |

The pool contract **holds its own A-Pass** — it custodies A-Tokens, so it must be compliant itself. Compliance is enforced at the token contract, not in our application code: a frozen borrower cannot repay, receive funds, or move collateral, and our own scripts revert exactly like a third party's would.

## Why hardware enforcement changes the credit maths

Enforcement that doesn't depend on physical recovery lets a lender extend more against the same asset:

| | Repossession-based | CircuitLend |
|---|---|---|
| Time to enforce | Days–weeks | ~10 seconds |
| Marginal cost to enforce | Agent dispatch, transport, disputes | One RPC read (borne by the device) |
| Recovery certainty | Low — device may be moved, hidden, resold | High — asset is inert until reinstated |
| Indicative safe LTV | 40–50% | 70–80% |
| Reinstatement after cure | Manual redelivery | Automatic on next repayment |

The prize is not liquidation, it is **cure**: a borrower who can restore power by paying is far more likely to pay than one already facing repossession.

## Known limitation, and why the model still works

A determined borrower can bypass a relay with a screwdriver. We do not claim tamper-proof hardware. Pay-as-you-go lenders such as M-KOPA have financed solar and smartphone hardware at scale in East Africa on exactly this lock-out mechanic — tamper risk is **priced, not fatal**, because bypassing forfeits warranty, servicing, and future credit. What CircuitLend adds on top is the compliance-grade audit trail and regulator-reachable kill-switch those systems lack.

Hardening (potted enclosure, tamper-detect switch latching enforcement on-chain) is a manufacturing problem, not a protocol one, and was deliberately out of scope for a 48-hour build.

## Go to market

Ship the firmware as an **open breaker standard** plus a retrofit dongle that sits between existing inverter/solar brands (Victron, Growatt) and their load. Lenders adopt the pool contract; manufacturers adopt the standard; neither has to trust the other, because both read the same chain.

## Status

Full lifecycle verified live on Monad testnet — originate → repay → CVI freeze while current → restore → lease lapse → permissionless enforce → liquidate — with the physical relay following chain state on real hardware. Contract tests 10/10.
