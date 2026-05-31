// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {LlmInferenceSmokeTest} from "../src/test/LlmInferenceSmokeTest.sol";

contract DeployLlmInferenceSmokeTest is Script {
    function run() external returns (address smokeTest) {
        vm.startBroadcast();
        smokeTest = address(new LlmInferenceSmokeTest());
        vm.stopBroadcast();
    }
}
