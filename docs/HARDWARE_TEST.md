# Hardware enforcement test — on-device log

Captured 2026-08-08 on the actual rig: ESP32-D0WD-V3 (CH340, COM7) running
`firmware/main.py` under MicroPython v1.28.0, 1-channel 5V relay on GPIO23
(active-high), against the live `CircuitLendPool` on Monad testnet.

The device was given **no commands**. It polls Monad itself, so the only input
to this test was an A-Pass freeze issued through the Cleanverse API from a
different machine.

## Loan under test

Loan **#3** — principal 100 CLUSD, installment 10, lease 120s, grace 60s.

## Log

```
wifi: True 192.168.34.159
[828] lease=ON  cvi=ACTIVE -> relay CLOSED (device ON)
[852] lease=ON  cvi=ACTIVE -> relay CLOSED (device ON)
[862] lease=ON  cvi=FROZEN -> relay OPEN (device OFF)     <-- A-Pass frozen at 07:56:36Z
[871] lease=ON  cvi=FROZEN -> relay OPEN (device OFF)
[880] lease=ON  cvi=FROZEN -> relay OPEN (device OFF)
[889] lease=ON  cvi=FROZEN -> relay OPEN (device OFF)
[898] lease=ON  cvi=FROZEN -> relay OPEN (device OFF)
[907] lease=OFF cvi=FROZEN -> relay OPEN (device OFF)     <-- lease also lapsed naturally
[916] lease=OFF cvi=ACTIVE -> relay OPEN (device OFF)     <-- unfrozen at 07:57:35Z, still off
...repayment extends the lease...
[1015] lease=ON cvi=ACTIVE -> relay CLOSED (device ON)    <-- power restored
[1030] lease=ON cvi=ACTIVE -> relay CLOSED (device ON)
```

## What this proves

- **Compliance revocation cuts power while payments are current.** At tick 862 the
  lease was still valid (`lease=ON`) and the device went dark purely because the
  borrower's A-Pass was frozen. This is the claim the whole project rests on.
- **Detection latency ≤10s** — one poll cycle. Each cycle is two TLS `eth_call`s
  from the ESP32, so the 4s configured interval lands at roughly 10s in practice.
- **Both conditions are required.** At tick 916 the A-Pass was active again but
  the lease had lapsed, and the relay correctly stayed open. Power returns only
  when lease *and* compliance both pass.
- **Recovery is automatic.** A repayment extends the lease and the device powers
  itself back on with no intervention.

## Reproducing

```bash
node scripts/05_open_loan.js 120 60          # note the loan id
# set LOAN_ID in firmware/config.py
python -m mpremote connect COM7 fs cp firmware/config.py :config.py
python -m mpremote connect COM7 run firmware/main.py    # streams the log above
node scripts/07_compliance.js                # freeze -> watch the relay open
```
