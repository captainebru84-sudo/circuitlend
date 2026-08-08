const { call } = require('./client');

// Testnet faucet — plain JSON, clamps to 5 tokens max, ~1 successful request/day.
// Note (reported to Cleanverse 2026-08-07): monad faucet wallet is unfunded;
// CircuitLend launches its own CLUSD settlement A-Token instead.
async function request({ chain = 'monad', symbol = 'usdc', depositAddress, amount = '5' }) {
  return call('/faucet', { chain, symbol, depositAddress, amount }, { encrypted: false });
}

module.exports = { request };
