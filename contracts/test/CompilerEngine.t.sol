// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AddressRegistry} from "../src/AddressRegistry.sol";
import {CompilerEngine} from "../src/CompilerEngine.sol";
import {GoalRegistry} from "../src/GoalRegistry.sol";
import {IntentStore} from "../src/IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {SomniaConfig} from "../src/SomniaConfig.sol";
import {StandardOrderEncoder} from "../src/StandardOrderEncoder.sol";

contract CompilerEngineTest is Test {
    function testPostGoalStartsStubCompile() external {
        AddressRegistry addressRegistry = new AddressRegistry(address(this));
        StandardOrderEncoder encoder = new StandardOrderEncoder(address(addressRegistry));
        ReceiptLogContract receiptLog = new ReceiptLogContract(address(0));
        IntentStore intentStore = new IntentStore(address(0));
        GoalRegistry goalRegistry = new GoalRegistry(address(0));
        CompilerEngine compilerEngine = new CompilerEngine(
            SomniaConfig.TESTNET_PLATFORM,
            address(goalRegistry),
            address(receiptLog),
            address(intentStore),
            address(encoder)
        );

        receiptLog.setCompilerEngine(address(compilerEngine));
        intentStore.setCompilerEngine(address(compilerEngine));
        goalRegistry.setCompilerEngine(address(compilerEngine));

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 goalId = goalRegistry.postGoal(
            "maximize USDC yield",
            address(0x1234),
            1_000e6,
            42161,
            constraints,
            block.timestamp + 1 days
        );

        assertEq(goalId, 0);
        assertEq(uint256(goalRegistry.getGoal(goalId).status), uint256(GoalRegistry.GoalStatus.Compiling));
        (uint256 storedGoalId,,,,) = compilerEngine.compileStates(goalId);
        assertEq(storedGoalId, goalId);
    }
}
