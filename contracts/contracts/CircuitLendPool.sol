// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title CircuitLendPool — hardware-backed RWA lending with physical lease-TTL enforcement.
/// @notice Settlement (CLUSD) and collateral (CLDT01 device notes) are Cleanverse A-Tokens:
/// every transfer here is compliance-checked at the token contract level (NoAPass /
/// APassNotActive reverts), so a frozen borrower cannot repay, receive funds, or move
/// collateral. The pool contract holds its own A-Pass and is registered with the APass
/// Compliance Validator. The financed device polls isPowered() directly from chain and
/// fails closed — no server, no push commands.
contract CircuitLendPool {
    struct Loan {
        address borrower;
        uint256 principal;
        uint256 outstanding;
        uint256 installment;
        uint256 collateral; // CLDT01 device-note units held in custody
        uint64 leaseExpiry; // paying extends this; past expiry+grace the breaker opens
        uint64 leaseDuration; // seconds each full installment buys
        uint64 graceSeconds;
        bool enforced; // latched breaker (default or compliance revocation)
        bool closed; // fully repaid
    }

    address public owner; // lender / originator
    IERC20 public immutable settlement; // CLUSD
    IERC20 public immutable deviceNote; // CLDT01
    uint256 public loanCount;
    mapping(uint256 => Loan) public loans;

    event LoanOpened(uint256 indexed loanId, address indexed borrower, uint256 principal, uint256 collateral, uint64 leaseExpiry);
    event PaymentReceived(uint256 indexed loanId, uint256 amount, uint256 outstanding, uint64 newLeaseExpiry);
    event LoanClosed(uint256 indexed loanId);
    event Enforced(uint256 indexed loanId, string reason);
    event Restored(uint256 indexed loanId, uint64 newLeaseExpiry);
    event Liquidated(uint256 indexed loanId, uint256 collateral);
    /// @notice Uniform audit trail — one receipt per state change, consumed off-chain
    /// into audit-ready JSON alongside Cleanverse A-Pass record IDs.
    event ComplianceReceipt(uint256 indexed loanId, string action, string detail, address actor, uint256 timestamp);

    error NotOwner();
    error BadLoan();
    error NotEnforceable();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IERC20 settlement_, IERC20 deviceNote_) {
        owner = msg.sender;
        settlement = settlement_;
        deviceNote = deviceNote_;
    }

    /// @notice Lender deposits CLUSD liquidity (compliance-checked by the token itself).
    function fund(uint256 amount) external onlyOwner {
        require(settlement.transferFrom(msg.sender, address(this), amount), "fund failed");
        emit ComplianceReceipt(0, "POOL_FUNDED", "", msg.sender, block.timestamp);
    }

    /// @notice Originate: custody borrower's device note, disburse principal.
    /// Borrower must hold an active A-Pass or both transfers revert on-chain.
    function openLoan(
        address borrower,
        uint256 collateralAmount,
        uint256 principal,
        uint256 installment,
        uint64 leaseDuration,
        uint64 graceSeconds
    ) external onlyOwner returns (uint256 loanId) {
        require(borrower != address(0) && principal > 0 && installment > 0 && leaseDuration > 0, "bad params");
        loanId = ++loanCount;
        uint64 expiry = uint64(block.timestamp) + leaseDuration;
        loans[loanId] = Loan({
            borrower: borrower,
            principal: principal,
            outstanding: principal,
            installment: installment,
            collateral: collateralAmount,
            leaseExpiry: expiry,
            leaseDuration: leaseDuration,
            graceSeconds: graceSeconds,
            enforced: false,
            closed: false
        });
        require(deviceNote.transferFrom(borrower, address(this), collateralAmount), "collateral failed");
        require(settlement.transfer(borrower, principal), "disburse failed");
        emit LoanOpened(loanId, borrower, principal, collateralAmount, expiry);
        emit ComplianceReceipt(loanId, "LOAN_OPENED", "", msg.sender, block.timestamp);
    }

    /// @notice Repay: each full installment extends the lease by leaseDuration.
    function repay(uint256 loanId, uint256 amount) external {
        Loan storage l = loans[loanId];
        if (l.borrower == address(0) || l.closed) revert BadLoan();
        uint256 pay = amount > l.outstanding ? l.outstanding : amount;
        require(settlement.transferFrom(msg.sender, address(this), pay), "payment failed");
        l.outstanding -= pay;

        uint64 base = l.leaseExpiry > block.timestamp ? l.leaseExpiry : uint64(block.timestamp);
        uint64 extension = uint64((pay * l.leaseDuration) / l.installment);
        l.leaseExpiry = base + extension;

        emit PaymentReceived(loanId, pay, l.outstanding, l.leaseExpiry);
        emit ComplianceReceipt(loanId, "PAYMENT", "", msg.sender, block.timestamp);

        if (l.outstanding == 0) {
            l.closed = true;
            require(deviceNote.transfer(l.borrower, l.collateral), "release failed");
            emit LoanClosed(loanId);
            emit ComplianceReceipt(loanId, "LOAN_CLOSED", "collateral released", msg.sender, block.timestamp);
        }
    }

    /// @notice Permissionless latch once the lease has lapsed past grace — the power
    /// cutoff itself is already automatic via isPowered(); this records the receipt.
    function enforce(uint256 loanId) external {
        Loan storage l = loans[loanId];
        if (l.borrower == address(0) || l.closed || l.enforced) revert BadLoan();
        if (block.timestamp <= uint256(l.leaseExpiry) + l.graceSeconds) revert NotEnforceable();
        l.enforced = true;
        emit Enforced(loanId, "LEASE_DEFAULT");
        emit ComplianceReceipt(loanId, "ENFORCED", "LEASE_DEFAULT", msg.sender, block.timestamp);
    }

    /// @notice Compliance kill-switch: latches the breaker even if payments are
    /// current (e.g. the borrower's A-Pass was revoked by the issuer/regulator).
    function enforceCompliance(uint256 loanId, string calldata reason) external onlyOwner {
        Loan storage l = loans[loanId];
        if (l.borrower == address(0) || l.enforced) revert BadLoan();
        l.enforced = true;
        emit Enforced(loanId, reason);
        emit ComplianceReceipt(loanId, "ENFORCED_COMPLIANCE", reason, msg.sender, block.timestamp);
    }

    /// @notice Reinstate after resolution: clears the latch and grants lease time.
    function restore(uint256 loanId, uint64 leaseSeconds) external onlyOwner {
        Loan storage l = loans[loanId];
        if (l.borrower == address(0)) revert BadLoan();
        l.enforced = false;
        uint64 base = l.leaseExpiry > block.timestamp ? l.leaseExpiry : uint64(block.timestamp);
        l.leaseExpiry = base + leaseSeconds;
        emit Restored(loanId, l.leaseExpiry);
        emit ComplianceReceipt(loanId, "RESTORED", "", msg.sender, block.timestamp);
    }

    /// @notice After enforcement, lender takes custody of the device note.
    function liquidate(uint256 loanId) external onlyOwner {
        Loan storage l = loans[loanId];
        if (l.borrower == address(0) || !l.enforced || l.collateral == 0) revert BadLoan();
        uint256 amount = l.collateral;
        l.collateral = 0;
        require(deviceNote.transfer(owner, amount), "liquidation failed");
        emit Liquidated(loanId, amount);
        emit ComplianceReceipt(loanId, "LIQUIDATED", "", msg.sender, block.timestamp);
    }

    /// @notice The single view the ESP32 breaker polls. Power is on iff the loan is
    /// not latched AND (fully repaid OR lease still valid within grace). A lapsed
    /// lease cuts power automatically — no transaction required.
    function isPowered(uint256 loanId) external view returns (bool) {
        Loan storage l = loans[loanId];
        if (l.borrower == address(0) || l.enforced) return false;
        if (l.closed) return true;
        return block.timestamp <= uint256(l.leaseExpiry) + l.graceSeconds;
    }

    /// @notice Seconds of lease remaining (incl. grace); 0 if lapsed. For dashboards.
    function leaseRemaining(uint256 loanId) external view returns (uint256) {
        Loan storage l = loans[loanId];
        uint256 deadline = uint256(l.leaseExpiry) + l.graceSeconds;
        return block.timestamp >= deadline ? 0 : deadline - block.timestamp;
    }
}
