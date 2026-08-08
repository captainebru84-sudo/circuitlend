const { call } = require('./client');

// Validator Compliance (CCP) — register our pool contract with the APass
// Compliance Validator so pool policy (tier/group/country rules) is enforced
// and live-editable. Registration needs an EIP-191 signature by the contract
// owner over lowercase(chain + contract_address); /validator/grant is NOT
// needed (Cleanverse backend holds the registrar role).

function makeRule({ minTier = 30, minSubTier = 0, allowedGroup = '', allowedSubGroup = '', isBlackList = false, countries = [] } = {}) {
  return {
    allowed_group: allowedGroup,
    allowed_sub_group: allowedSubGroup,
    min_tier: minTier,
    min_sub_tier: minSubTier,
    is_black_list: isBlackList,
    countries,
  };
}

async function signOwnership(signer, { chain = 'monad', contractAddress }) {
  return signer.signMessage(chain + contractAddress.toLowerCase());
}

async function register({ chain = 'monad', contractAddress, rule, ownerSignature }) {
  return call(
    '/validator/register',
    { chain, contract_address: contractAddress.toLowerCase(), rule, owner_signature: ownerSignature },
    { encrypted: true }
  );
}

async function isRegistered({ chain = 'monad', contractAddress }) {
  return call('/validator/is_register', { chain, contract_address: contractAddress.toLowerCase() }, { encrypted: false });
}

async function setRule({ chain = 'monad', contractAddress, rule }) {
  return call('/validator/set_rule', { chain, contract_address: contractAddress.toLowerCase(), rule }, { encrypted: true });
}

async function verify({ chain = 'monad', contractAddress, userAddress }) {
  return call(
    '/validator/verify',
    { chain, contract_address: contractAddress.toLowerCase(), user_address: userAddress },
    { encrypted: false }
  );
}

async function setPaused({ chain = 'monad', contractAddress, paused }) {
  return call('/validator/set_paused', { chain, contract_address: contractAddress.toLowerCase(), paused }, { encrypted: true });
}

module.exports = { makeRule, signOwnership, register, isRegistered, setRule, verify, setPaused };
