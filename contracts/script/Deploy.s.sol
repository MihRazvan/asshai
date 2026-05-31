// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {SomniaConfig} from "../src/SomniaConfig.sol";
import {AddressRegistry} from "../src/AddressRegistry.sol";
import {CompilerEngine} from "../src/CompilerEngine.sol";
import {GoalRegistry} from "../src/GoalRegistry.sol";
import {IntentStore} from "../src/IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {StandardOrderEncoder} from "../src/StandardOrderEncoder.sol";

contract Deploy is Script {
    function run()
        external
        returns (
            address goalRegistryAddress,
            address compilerEngineAddress,
            address receiptLogAddress,
            address intentStoreAddress,
            address addressRegistryAddress,
            address standardOrderEncoderAddress
        )
    {
        vm.startBroadcast();

        address addressRegistry = address(new AddressRegistry(msg.sender));
        address standardOrderEncoder = address(new StandardOrderEncoder(addressRegistry));
        address receiptLog = address(new ReceiptLogContract(msg.sender, address(0)));
        address intentStore = address(new IntentStore(msg.sender, address(0)));
        address goalRegistry = address(new GoalRegistry(msg.sender, address(0)));
        address compilerEngine = address(new CompilerEngine(
            SomniaConfig.TESTNET_PLATFORM,
            goalRegistry,
            receiptLog,
            intentStore,
            standardOrderEncoder,
            vm.envOr("COMPILER_RATES_URL", string("https://example.com/api/yields")),
            vm.envOr("COMPILER_RATES_SELECTOR", string("payload"))
        ));

        ReceiptLogContract(receiptLog).setCompilerEngine(compilerEngine);
        IntentStore(intentStore).setCompilerEngine(compilerEngine);
        GoalRegistry(payable(goalRegistry)).setCompilerEngine(compilerEngine);

        vm.stopBroadcast();

        goalRegistryAddress = goalRegistry;
        compilerEngineAddress = compilerEngine;
        receiptLogAddress = receiptLog;
        intentStoreAddress = intentStore;
        addressRegistryAddress = addressRegistry;
        standardOrderEncoderAddress = standardOrderEncoder;
    }
}
