# Device configuration — edit before flashing.
WIFI_SSID = 'CAMPUS CONNECT'
WIFI_PASSWORD = '1234567800'

RPC_URL = 'https://testnet-rpc.monad.xyz'

# CircuitLendPool on Monad testnet + this device's loan id
POOL_ADDRESS = ''  # filled after deploy
LOAN_ID = 1

# Borrower wallet + settlement A-Token (CLUSD) for the CVI probe:
# the device simulates a 1-unit self-transfer from the borrower; a frozen
# A-Pass makes the token revert APassNotActive on-chain.
BORROWER_ADDRESS = ''
SETTLEMENT_TOKEN = ''

RELAY_PIN = 23        # active-high: HIGH = relay energized = device powered
POLL_SECONDS = 4
GRACE_SECONDS = 60    # keep last-known-good through RPC/WiFi outages, then fail closed
