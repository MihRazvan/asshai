// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AddressRegistry} from "../src/AddressRegistry.sol";
import {CompilerEngine} from "../src/CompilerEngine.sol";
import {GoalRegistry} from "../src/GoalRegistry.sol";
import {IntentStore} from "../src/IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {SomniaConfig} from "../src/SomniaConfig.sol";
import {StandardOrderEncoder} from "../src/StandardOrderEncoder.sol";

contract DeployCompilerStack is Script {
    function run()
        external
        returns (
            address addressRegistryAddress,
            address standardOrderEncoderAddress,
            address compilerEngineAddress
        )
    {
        address goalRegistry = vm.envAddress("NEXT_PUBLIC_GOAL_REGISTRY_ADDRESS");
        address receiptLog = vm.envAddress("NEXT_PUBLIC_RECEIPT_LOG_ADDRESS");
        address intentStore = vm.envAddress("NEXT_PUBLIC_INTENT_STORE_ADDRESS");

        vm.startBroadcast();

        addressRegistryAddress = address(new AddressRegistry(msg.sender));
        standardOrderEncoderAddress = address(new StandardOrderEncoder(addressRegistryAddress));
        compilerEngineAddress = address(
            new CompilerEngine(
                SomniaConfig.TESTNET_PLATFORM,
                goalRegistry,
                receiptLog,
                intentStore,
                standardOrderEncoderAddress,
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
