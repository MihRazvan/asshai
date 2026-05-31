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
import {
    ConsensusType,
    IAgentRequester,
    Request,
    ResponseStatus
} from "../src/interfaces/IAgentRequester.sol";

contract MockAgentRequester is IAgentRequester {
    uint256 public nextRequestId = 1;

    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId) {
        requestId = nextRequestId++;
        address[] memory subcommittee = new address[](0);
        emit RequestCreated(requestId, agentId, msg.value, payload, subcommittee);
        callbackAddress;
        callbackSelector;
    }

    function createAdvancedRequest(
        uint256,
        address,
        bytes4,
        bytes calldata,
        uint256,
        uint256,
        ConsensusType,
        uint256
    ) external payable returns (uint256 requestId) {
        requestId = nextRequestId++;
    }

    function getRequest(uint256) external pure returns (Request memory) {
        revert("not implemented");
    }

    function hasRequest(uint256) external pure returns (bool) {
        return false;
    }

    function getRequestDeposit() external pure returns (uint256) {
        return 0.03 ether;
    }

    function getAdvancedRequestDeposit(uint256) external pure returns (uint256) {
        return 0.03 ether;
    }
}

contract CompilerEngineTest is Test {
    function testPostGoalStartsStubCompile() external {
        MockAgentRequester platform = new MockAgentRequester();
        AddressRegistry addressRegistry = new AddressRegistry(address(this));
        StandardOrderEncoder encoder = new StandardOrderEncoder(address(addressRegistry));
        ReceiptLogContract receiptLog = new ReceiptLogContract(address(this), address(0));
        IntentStore intentStore = new IntentStore(address(this), address(0));
        GoalRegistry goalRegistry = new GoalRegistry(address(this), address(0));
        CompilerEngine compilerEngine = new CompilerEngine(
            address(platform),
            address(goalRegistry),
            address(receiptLog),
            address(intentStore),
            address(encoder),
            "https://example.com/api/yields",
            "payload"
        );

        receiptLog.setCompilerEngine(address(compilerEngine));
        intentStore.setCompilerEngine(address(compilerEngine));
        goalRegistry.setCompilerEngine(address(compilerEngine));

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 goalId = goalRegistry.postGoal{value: 0.12 ether}(
            "maximize USDC yield",
            address(0x1234),
            1_000e6,
            42161,
            constraints,
            block.timestamp + 1 days
        );

        assertEq(goalId, 0);
        assertEq(uint256(goalRegistry.getGoal(goalId).status), uint256(GoalRegistry.GoalStatus.Compiling));
        (uint256 storedGoalId, CompilerEngine.CompileStep step, uint256 requestId,,) =
            compilerEngine.compileStates(goalId);
        assertEq(storedGoalId, goalId);
        assertEq(uint256(step), uint256(CompilerEngine.CompileStep.FetchingRates));
        assertEq(requestId, 1);
        assertTrue(compilerEngine.pendingRequests(requestId));
    }
}
