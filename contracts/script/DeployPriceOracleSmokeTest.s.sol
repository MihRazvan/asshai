// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {PriceOracleSmokeTest} from "../src/test/PriceOracleSmokeTest.sol";

contract DeployPriceOracleSmokeTest is Script {
    function run() external returns (address oracle) {
        vm.startBroadcast();
        oracle = address(new PriceOracleSmokeTest());
        vm.stopBroadcast();
    }
}
