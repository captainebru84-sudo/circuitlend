# CircuitLend breaker firmware (MicroPython, ESP32).
#
# The device receives ZERO commands. It reads its power entitlement straight
# from Monad every POLL_SECONDS via two independent checks:
#   1. LEASE:  eth_call CircuitLendPool.isPowered(loanId)  -> bool
#   2. CVI:    eth_call simulating settlement-token transfer(borrower->borrower);
#              a frozen A-Pass reverts APassNotActive (selector 322fde89).
# Power stays ON only while BOTH pass. On outages (WiFi/RPC down) the last
# known-good state is honored for GRACE_SECONDS, then the relay fails closed.
# Loss of power to the ESP32 itself also fails closed (relay de-energizes).

import network, time, requests
from machine import Pin
import config

SEL_IS_POWERED = '58ea2f44'
SEL_TRANSFER = 'a9059cbb'
ERR_APASS_NOT_ACTIVE = '322fde89'
ERR_NO_APASS = 'a6725971'

relay = Pin(config.RELAY_PIN, Pin.OUT, value=0)  # boot fail-closed


def wifi_connect():
    sta = network.WLAN(network.STA_IF)
    sta.active(True)
    if not sta.isconnected():
        sta.connect(config.WIFI_SSID, config.WIFI_PASSWORD)
        for _ in range(30):
            if sta.isconnected():
                break
            time.sleep(1)
    print('wifi:', sta.isconnected(), sta.ifconfig()[0] if sta.isconnected() else '-')
    return sta


def eth_call(to, data, frm=None):
    """Returns ('ok', result_hex) or ('revert', body) or ('err', None)."""
    call = {'to': to, 'data': data}
    if frm:
        call['from'] = frm
    try:
        r = requests.post(config.RPC_URL, json={
            'jsonrpc': '2.0', 'id': 1, 'method': 'eth_call', 'params': [call, 'latest']
        })
        body = r.text
        r.close()
        if '"result"' in body:
            start = body.find('"result"')
            q1 = body.find('"', start + 9)
            q2 = body.find('"', q1 + 1)
            return 'ok', body[q1 + 1:q2]
        return 'revert', body
    except Exception as e:
        print('  rpc err:', e)
        return 'err', None


def u256(n):
    return '%064x' % n


def check_lease():
    """'ON', 'OFF', or 'UNKNOWN' from pool.isPowered(loanId)."""
    status, res = eth_call(config.POOL_ADDRESS, '0x' + SEL_IS_POWERED + u256(config.LOAN_ID))
    if status == 'ok':
        return 'ON' if res.rstrip().endswith('1') else 'OFF'
    return 'UNKNOWN'


def check_cvi():
    """'ACTIVE', 'FROZEN', or 'UNKNOWN' via simulated borrower self-transfer."""
    if not config.BORROWER_ADDRESS or not config.SETTLEMENT_TOKEN:
        return 'ACTIVE'  # probe not configured
    data = '0x' + SEL_TRANSFER + '0' * 24 + config.BORROWER_ADDRESS[2:].lower() + u256(1)
    status, body = eth_call(config.SETTLEMENT_TOKEN, data, frm=config.BORROWER_ADDRESS)
    if status == 'ok':
        return 'ACTIVE'
    if status == 'revert' and body and (ERR_APASS_NOT_ACTIVE in body or ERR_NO_APASS in body):
        return 'FROZEN'
    return 'UNKNOWN'


def main():
    wifi_connect()
    last_good = None       # True/False, last definitive answer
    last_good_at = time.time()

    while True:
        lease = check_lease()
        cvi = check_cvi()

        if lease == 'UNKNOWN' or cvi == 'UNKNOWN':
            age = time.time() - last_good_at
            if last_good and age <= config.GRACE_SECONDS:
                powered = True
                verdict = 'GRACE (%ds of %ds)' % (age, config.GRACE_SECONDS)
            else:
                powered = False
                verdict = 'FAIL-CLOSED (no chain contact)'
        else:
            powered = (lease == 'ON') and (cvi == 'ACTIVE')
            last_good = powered
            last_good_at = time.time()
            verdict = 'lease=%s cvi=%s' % (lease, cvi)

        relay.value(1 if powered else 0)
        print('[%s] %s -> relay %s' % (time.time(), verdict,
              'CLOSED (device ON)' if powered else 'OPEN (device OFF)'))
        time.sleep(config.POLL_SECONDS)


main()
