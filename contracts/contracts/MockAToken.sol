// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test double for a Cleanverse A-Token: ERC-20 that reverts APassNotActive
/// on either leg of a transfer when the address is frozen — mirrors on-chain
/// behavior observed on CLDT01 (Monad testnet).
contract MockAToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public frozen;

    error APassNotActive(address account);
    error NoAPass(address account);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setFrozen(address account, bool value) external {
        frozen[account] = value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function _compliance(address from, address to) internal view {
        if (frozen[from]) revert APassNotActive(from);
        if (frozen[to]) revert APassNotActive(to);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _compliance(msg.sender, to);
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _compliance(from, to);
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
