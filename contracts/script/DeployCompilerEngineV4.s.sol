// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CompilerEngineV4} from "../src/CompilerEngineV4.sol";
import {GoalRegistry} from "../src/GoalRegistry.sol";
import {IntentStore} from "../src/IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {SomniaConfig} from "../src/SomniaConfig.sol";

contract DeployCompilerEngineV4 is Script {
    function run() external returns (address compilerEngineAddress) {
        address goalRegistry = vm.envAddress("NEXT_PUBLIC_GOAL_REGISTRY_ADDRESS");
        address receiptLog = vm.envAddress("NEXT_PUBLIC_RECEIPT_LOG_ADDRESS");
        address intentStore = vm.envAddress("NEXT_PUBLIC_INTENT_STORE_ADDRESS");
        address standardOrderEncoder = vm.envAddress("NEXT_PUBLIC_STANDARD_ORDER_ENCODER_ADDRESS");

        vm.startBroadcast();

        compilerEngineAddress = address(
            new CompilerEngineV4(
                SomniaConfig.TESTNET_PLATFORM,
                goalRegistry,
                receiptLog,
                intentStore,
                standardOrderEncoder,
                vm.envOr("COMPILER_RATES_URL", string("https://example.com/api/yields")),
                vm.envOr("COMPILER_RATES_SELECTOR", string("payload"))
            )
        );

        ReceiptLogContract(receiptLog).setCompilerEngine(compilerEngineAddress);
        IntentStore(intentStore).setCompilerEngine(compilerEngineAddress);
        GoalRegistry(payable(goalRegistry)).setCompilerEngine(compilerEngineAddress);

        vm.stopBroadcast();
    }
}
