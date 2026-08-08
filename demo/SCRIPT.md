# CircuitLend — demo video script

Target length **4–5 minutes**. Judging weights integration depth (30) and demo/UX
(15), so every beat below ties an on-screen action to a Cleanverse primitive.

## Framing

Two sources, picture-in-picture:

- **Main:** screen capture of the lender console (`http://localhost:3000`) plus a
  terminal for the device log.
- **Inset (bottom-right):** phone camera on the rig — the USB load and the relay's
  status LED. The viewer must be able to see the load die in real time.

Keep the rig in frame for the whole video. The single most convincing thing here
is physical hardware reacting to a compliance API call.

## Pre-flight checklist

Run this ~10 minutes before recording.

```bash
node scripts/00_topup_gas.js 1.0        # Monad reserves against maxFeePerGas — do not skip
node scripts/08_status.js               # confirm A-Pass ACTIVE, validator valid
node scripts/05_open_loan.js 120 60     # FRESH loan — note the loan id
```

- Set `LOAN_ID` in `firmware/config.py` to the new loan, then
  `python -m mpremote connect COM7 fs cp firmware/config.py :config.py`
- Start the console: `node dashboard/server.js`, open `?loanId=<new id>`
- Start the device log: `python -m mpremote connect COM7 run firmware/main.py`
- Confirm the load is **on** and the console shows the lease counting down.

Have a second terminal ready for the action commands.

---

## Beat 1 — Cold open (0:00–0:25)

**Shot:** the rig, load running.

> "This is a financed appliance. It's running because a loan on Monad says it's
> allowed to. Nothing is sending it commands — it's reading the chain itself.
> Watch what happens when the borrower's compliance credential gets revoked."

Don't explain the architecture yet. Show the claim, then earn it.

## Beat 2 — The problem (0:25–1:00)

**Shot:** slide or console, no commands.

> "Hardware gets financed everywhere — solar kits, freezers, tools. When a
> borrower defaults, the lender's only recourse is sending someone to physically
> repossess it. That's slow, expensive, and usually not worth it, so the loan
> either doesn't happen or it's priced out of reach.
>
> Tokenising the asset doesn't fix it. You can seize a token on-chain while the
> machine keeps running in someone's shop. And if a regulator revokes a
> borrower's credential, there's no way to reach the asset at all."

## Beat 3 — What's actually deployed (1:00–1:40)

**Shot:** console, pointing at the address panel.

> "Two Cleanverse A-Tokens: CLUSD for settlement, and CLDT01 — the device note,
> the tokenised appliance. Both compliance-restricted from issuance. The pool
> contract is registered with the APass Compliance Validator and holds its own
> A-Pass, because it custodies A-Tokens. The borrower has an A-Pass at tier 50."

Point out the live lease countdown and the powered indicator.

## Beat 4 — Repayment extends the lease (1:40–2:10)

**Action:** click **Repay 10 CLUSD** in the console.

> "Each repayment buys lease time. Settlement rides CLUSD, so both legs of that
> payment are compliance-checked by the token contract itself."

**Show:** countdown jumps, receipt appears in the timeline.

## Beat 5 — THE HEADLINE: revoke compliance while payments are current (2:10–3:10)

Say this before clicking, so the viewer knows the loan is healthy:

> "This loan is fully current. The borrower owes nothing right now. I'm going to
> freeze their A-Pass through the Cleanverse API — a compliance action, not a
> payment one."

**Action:** click **Freeze A-Pass** (or `node scripts/07_compliance.js freeze <id>`).

**Then stop talking.** Let the ~10 seconds of silence run while the device log
ticks. Cut to the rig inset as the load dies.

> "No command was sent to that device. It ran an `eth_call` against the settlement
> token, got `APassNotActive` back, and opened its own relay. Ten seconds, and
> the asset is inert — while the loan is still in good standing."

This is the moment the video exists for. Do not rush it.

## Beat 6 — Restore (3:10–3:35)

**Action:** click **Restore**.

> "Compliance resolved, the borrower's A-Pass is reinstated, and the device powers
> itself back on. The valuable outcome here isn't liquidation, it's cure — someone
> who can turn their machine back on by paying is far likelier to pay."

## Beat 7 — Default path, no human in the loop (3:35–4:15)

> "The other trigger needs no action at all. When a lease lapses past its grace
> window, `isPowered` goes false on its own — no transaction, no server."

**Action:** let the lease run out (or open a 60s/30s loan for this beat), show the
load dying unattended. Then:

```bash
node scripts/09_default_enforce.js <loanId>
```

> "Anyone can latch the default on-chain — it's permissionless — and the lender
> takes custody of the device note. Every step emitted a compliance receipt
> pairing the tx hash with the A-Pass record."

**Show:** the receipts timeline.

## Beat 8 — Close (4:15–4:45)

> "Enforcement that costs one RPC read instead of a repossession agent changes
> what's lendable — indicatively 40–50% LTV up to 70–80%.
>
> Yes, someone can attack the relay with a screwdriver. We're not claiming
> tamper-proof hardware; pay-as-you-go lenders have financed millions of units on
> this exact mechanic because tamper risk is priced, not fatal. What we add is the
> audit trail and the regulator-reachable kill switch.
>
> Ship the firmware as an open standard plus a retrofit dongle, and any existing
> inverter brand becomes financeable collateral. That's CircuitLend."

---

## Recovery notes

- **Device shows FAIL-CLOSED (no chain contact):** hotspot dropped. Reconnect;
  it self-heals on the next poll.
- **A console action errors:** the message is now the real RPC error. "Signer had
  insufficient balance" means run `scripts/00_topup_gas.js 1.0`.
- **mpremote "could not enter raw repl":** boot race after plug-in — just retry.
- **Freeze appears to fail with `0002 [500]System Error`:** known Cleanverse
  quirk, the state still flips. The SDK re-queries to confirm; trust the console.
- Loans are cheap. If a take goes wrong, open a fresh one and re-shoot rather
  than trying to nurse a loan back into the right state on camera.
