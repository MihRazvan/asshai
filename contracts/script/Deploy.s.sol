// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {SomniaConfig} from "../src/SomniaConfig.sol";
import {IntentRegistry} from "../src/IntentRegistry.sol";
import {SolverEngine} from "../src/SolverEngine.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {PlanVault} from "../src/PlanVault.sol";

contract Deploy is Script {
    function run()
        external
        returns (
            address intentRegistryAddress,
            address solverEngineAddress,
            address receiptLogAddress,
            address planVaultAddress
        )
    {
        vm.startBroadcast();

        address receiptLog = address(new ReceiptLogContract(address(0)));
        address planVault = address(new PlanVault(address(0)));
        address intentRegistry = address(new IntentRegistry(address(0)));
        address solverEngine = address(new SolverEngine(
            SomniaConfig.TESTNET_PLATFORM,
            intentRegistry,
            receiptLog,
            planVault
        ));

        ReceiptLogContract(receiptLog).setSolverEngine(solverEngine);
        PlanVault(planVault).setSolverEngine(solverEngine);
        IntentRegistry(payable(intentRegistry)).setSolverEngine(solverEngine);

        vm.stopBroadcast();

        intentRegistryAddress = intentRegistry;
        solverEngineAddress = solverEngine;
        receiptLogAddress = receiptLog;
        planVaultAddress = planVault;
    }
}
