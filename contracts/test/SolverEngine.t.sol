// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntentRegistry} from "../src/IntentRegistry.sol";
import {PlanVault} from "../src/PlanVault.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {SolverEngine} from "../src/SolverEngine.sol";
import {SomniaConfig} from "../src/SomniaConfig.sol";

contract SolverEngineTest is Test {
    function testPostIntentStartsStubSolve() external {
        address receiptLog = address(new ReceiptLogContract(address(0)));
        address planVault = address(new PlanVault(address(0)));
        address registry = address(new IntentRegistry(address(0)));
        address solver = address(new SolverEngine(
            SomniaConfig.TESTNET_PLATFORM,
            registry,
            receiptLog,
            planVault
        ));

        ReceiptLogContract(receiptLog).setSolverEngine(solver);
        PlanVault(planVault).setSolverEngine(solver);
        IntentRegistry(payable(registry)).setSolverEngine(solver);

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 intentId = IntentRegistry(payable(registry)).postIntent(
            "maximize USDC yield",
            address(0x1234),
            1_000e6,
            42161,
            constraints,
            block.timestamp + 1 days
        );

        assertEq(intentId, 0);
    }
}
