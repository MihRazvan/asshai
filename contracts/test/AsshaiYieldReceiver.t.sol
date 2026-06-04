// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AsshaiYieldReceiver} from "../src/AsshaiYieldReceiver.sol";

contract MockUsdc {
    mapping(address => mapping(address => uint256)) public allowance;

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockAavePool {
    address public lastAsset;
    uint256 public lastAmount;
    address public lastBeneficiary;
    uint16 public lastReferralCode;

    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external {
        lastAsset = asset;
        lastAmount = amount;
        lastBeneficiary = onBehalfOf;
        lastReferralCode = referralCode;
    }
}

contract AsshaiYieldReceiverTest is Test {
    function testOutputFilledSuppliesToAaveForBeneficiary() external {
        address outputSettler = address(0x1001);
        address beneficiary = address(0xBEEF);
        address aUsdc = address(0xA);
        MockUsdc usdc = new MockUsdc();
        MockAavePool aavePool = new MockAavePool();
        AsshaiYieldReceiver receiver =
            new AsshaiYieldReceiver(outputSettler, address(aavePool), address(usdc), aUsdc);

        AsshaiYieldReceiver.YieldAction memory action = AsshaiYieldReceiver.YieldAction({
            goalId: 42,
            beneficiary: beneficiary,
            deliveryToken: address(usdc),
            positionToken: aUsdc,
            strategyId: receiver.AAVE_V3_USDC_BASE_SUPPLY(),
            minAmount: 990e6
        });

        vm.prank(outputSettler);
        receiver.outputFilled(_addressToBytes32(address(usdc)), 990e6, abi.encode(action));

        assertEq(aavePool.lastAsset(), address(usdc));
        assertEq(aavePool.lastAmount(), 990e6);
        assertEq(aavePool.lastBeneficiary(), beneficiary);
        assertEq(aavePool.lastReferralCode(), 0);
        assertEq(usdc.allowance(address(receiver), address(aavePool)), 990e6);
    }

    function testOutputFilledRejectsWrongCaller() external {
        MockUsdc usdc = new MockUsdc();
        MockAavePool aavePool = new MockAavePool();
        AsshaiYieldReceiver receiver =
            new AsshaiYieldReceiver(address(0x1001), address(aavePool), address(usdc), address(0xA));

        vm.expectRevert(AsshaiYieldReceiver.InvalidCaller.selector);
        receiver.outputFilled(_addressToBytes32(address(usdc)), 1, "");
    }

    function testOutputFilledRejectsWrongToken() external {
        address outputSettler = address(0x1001);
        MockUsdc usdc = new MockUsdc();
        MockAavePool aavePool = new MockAavePool();
        AsshaiYieldReceiver receiver =
            new AsshaiYieldReceiver(outputSettler, address(aavePool), address(usdc), address(0xA));

        vm.prank(outputSettler);
        vm.expectRevert(AsshaiYieldReceiver.InvalidToken.selector);
        receiver.outputFilled(_addressToBytes32(address(0xBAD)), 1, "");
    }

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }
}
