require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    monad: {
      url: process.env.MONAD_RPC || 'https://testnet-rpc.monad.xyz',
      accounts: process.env.DEV_WALLET_KEY ? [process.env.DEV_WALLET_KEY] : [],
    },
  },
};
