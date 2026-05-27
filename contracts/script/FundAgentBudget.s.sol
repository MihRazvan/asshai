// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

contract FundAgentBudget is Script {
    function run() external {
        address payable target = payable(vm.envAddress("AGENT_BUDGET_TARGET"));
        uint256 amount = vm.envUint("AGENT_BUDGET_AMOUNT_WEI");

        vm.startBroadcast();
        target.transfer(amount);
        vm.stopBroadcast();
    }
}

