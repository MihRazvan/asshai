// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IAaveV3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
}

interface IOutputCallback {
    function outputFilled(bytes32 token, uint256 amount, bytes calldata executionData) external;
}

contract AsshaiYieldReceiver is IOutputCallback {
    struct YieldAction {
        uint256 goalId;
        address beneficiary;
        address deliveryToken;
        address positionToken;
        bytes32 strategyId;
        uint256 minAmount;
    }

    bytes32 public constant AAVE_V3_USDC_BASE_SUPPLY = keccak256("aave-v3-usdc-base:supply");

    address public immutable outputSettler;
    address public immutable aavePool;
    address public immutable baseUsdc;
    address public immutable baseAUsdc;

    event YieldDeposited(
        uint256 indexed goalId,
        address indexed beneficiary,
        bytes32 indexed strategyId,
        address deliveryToken,
        address positionToken,
        uint256 amount
    );

    error InvalidCaller();
    error InvalidToken();
    error InvalidAction();
    error InvalidBeneficiary();
    error InvalidAmount();
    error ApproveFailed();

    constructor(address outputSettler_, address aavePool_, address baseUsdc_, address baseAUsdc_) {
        require(outputSettler_ != address(0), "Zero settler");
        require(aavePool_ != address(0), "Zero pool");
        require(baseUsdc_ != address(0), "Zero USDC");
        require(baseAUsdc_ != address(0), "Zero aUSDC");
        outputSettler = outputSettler_;
        aavePool = aavePool_;
        baseUsdc = baseUsdc_;
        baseAUsdc = baseAUsdc_;
    }

    function outputFilled(bytes32 token, uint256 amount, bytes calldata executionData) external {
        if (msg.sender != outputSettler) revert InvalidCaller();
        if (token != _addressToBytes32(baseUsdc)) revert InvalidToken();

        YieldAction memory action = abi.decode(executionData, (YieldAction));
        if (action.strategyId != AAVE_V3_USDC_BASE_SUPPLY) revert InvalidAction();
        if (action.deliveryToken != baseUsdc || action.positionToken != baseAUsdc) revert InvalidToken();
        if (action.beneficiary == address(0)) revert InvalidBeneficiary();
        if (amount == 0 || amount < action.minAmount) revert InvalidAmount();

        _forceApprove(baseUsdc, aavePool, amount);
        IAaveV3Pool(aavePool).supply(baseUsdc, amount, action.beneficiary, 0);

        emit YieldDeposited(action.goalId, action.beneficiary, action.strategyId, baseUsdc, baseAUsdc, amount);
    }

    function _forceApprove(address token, address spender, uint256 amount) private {
        _callApprove(token, spender, 0);
        _callApprove(token, spender, amount);
    }

    function _callApprove(address token, address spender, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20.approve, (spender, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert ApproveFailed();
    }

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }
}
