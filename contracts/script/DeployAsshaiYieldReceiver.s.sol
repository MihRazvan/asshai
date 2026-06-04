// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AsshaiYieldReceiver} from "../src/AsshaiYieldReceiver.sol";

contract DeployAsshaiYieldReceiver is Script {
    address internal constant OUTPUT_SETTLER = 0x0000000000eC36B683C2E6AC89e9A75989C22a2e;
    address internal constant AAVE_V3_BASE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant BASE_AUSDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;

    function run() external returns (address receiverAddress) {
        vm.startBroadcast();
        receiverAddress = address(new AsshaiYieldReceiver(OUTPUT_SETTLER, AAVE_V3_BASE_POOL, BASE_USDC, BASE_AUSDC));
        vm.stopBroadcast();
    }
}
