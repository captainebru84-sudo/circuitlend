# Device configuration — edit before flashing.
WIFI_SSID = 'CAMPUS CONNECT'
WIFI_PASSWORD = '1234567800'

RPC_URL = 'https://testnet-rpc.monad.xyz'

# CircuitLendPool on Monad testnet + this device's loan id
POOL_ADDRESS = '0x5538b0CF2f97e73cedD6349Ef50E299A95B70DdF'
LOAN_ID = 1

# Borrower wallet + settlement A-Token (CLUSD) for the CVI probe:
# the device simulates a 1-unit self-transfer from the borrower; a frozen
# A-Pass makes the token revert APassNotActive on-chain.
BORROWER_ADDRESS = '0x2e2BA14F6784B72fE9874b41811193B5B0bdd0cA'
SETTLEMENT_TOKEN = '0x09A050Eb813ddb0b1EEAE7bca83bc1becD04FA31'  # CLUSD

RELAY_PIN = 23        # active-high: HIGH = relay energized = device powered
POLL_SECONDS = 4
GRACE_SECONDS = 60    # keep last-known-good through RPC/WiFi outages, then fail closed
