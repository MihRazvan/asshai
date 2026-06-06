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
import {ConsensusType, IAgentRequester, Request, Response, ResponseStatus} from "../src/interfaces/IAgentRequester.sol";

contract MockAgentRequester is IAgentRequester {
    uint256 public nextRequestId = 1;
    uint256 public lastAgentId;
    address public lastCallbackAddress;
    bytes4 public lastCallbackSelector;
    bytes public lastPayload;
    uint256 public lastValue;

    function createRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes calldata payload)
        external
        payable
        returns (uint256 requestId)
    {
        requestId = nextRequestId++;
        lastAgentId = agentId;
        lastCallbackAddress = callbackAddress;
        lastCallbackSelector = callbackSelector;
        lastPayload = payload;
        lastValue = msg.value;
        address[] memory subcommittee = new address[](0);
        emit RequestCreated(requestId, agentId, msg.value, payload, subcommittee);
    }

    function createAdvancedRequest(uint256, address, bytes4, bytes calldata, uint256, uint256, ConsensusType, uint256)
        external
        payable
        returns (uint256 requestId)
    {
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
    struct CanonicalMandateOutput {
        bytes32 oracle;
        bytes32 settler;
        uint256 chainId;
        bytes32 token;
        uint256 amount;
        bytes32 recipient;
        bytes callbackData;
        bytes context;
    }

    struct CanonicalStandardOrder {
        address user;
        uint256 nonce;
        uint256 originChainId;
        uint32 expires;
        uint32 fillDeadline;
        address inputOracle;
        uint256[2][] inputs;
        CanonicalMandateOutput[] outputs;
    }

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
            "maximize USDC yield", address(0x1234), 1_000e6, 42161, constraints, block.timestamp + 1 days
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

    function testRatesCallbackCreatesFilterRequest() external {
        (MockAgentRequester platform, CompilerEngine compilerEngine, GoalRegistry goalRegistry,) = _deployHarness();

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 goalId = goalRegistry.postGoal{value: 0.6 ether}(
            "maximize USDC yield", address(0x1234), 1_000e6, 42161, constraints, block.timestamp + 1 days
        );

        _mockRatesCallback(platform, compilerEngine);

        (uint256 storedGoalId, CompilerEngine.CompileStep step, uint256 requestId,,) =
            compilerEngine.compileStates(goalId);
        assertEq(storedGoalId, goalId);
        assertEq(uint256(step), uint256(CompilerEngine.CompileStep.FilteringPools));
        assertEq(requestId, 2);
        assertEq(platform.lastAgentId(), SomniaConfig.LLM_INFERENCE_AGENT_ID);
        assertEq(platform.lastCallbackSelector(), compilerEngine.handleFilterResponse.selector);
        assertTrue(compilerEngine.pendingRequests(requestId));
    }

    function testFilterCallbackCreatesPlanRequest() external {
        (MockAgentRequester platform, CompilerEngine compilerEngine, GoalRegistry goalRegistry,) = _deployHarness();

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 goalId = goalRegistry.postGoal{value: 0.6 ether}(
            "maximize USDC yield", address(0x1234), 1_000e6, 42161, constraints, block.timestamp + 1 days
        );

        _mockRatesCallback(platform, compilerEngine);
        _mockFilterCallback(platform, compilerEngine);

        (uint256 storedGoalId, CompilerEngine.CompileStep step, uint256 requestId,,) =
            compilerEngine.compileStates(goalId);
        assertEq(storedGoalId, goalId);
        assertEq(uint256(step), uint256(CompilerEngine.CompileStep.BuildingPlan));
        assertEq(requestId, 3);
        assertEq(platform.lastAgentId(), SomniaConfig.LLM_INFERENCE_AGENT_ID);
        assertEq(platform.lastCallbackSelector(), compilerEngine.handlePlanResponse.selector);
        assertTrue(compilerEngine.pendingRequests(requestId));
    }

    function testPlanCallbackEncodesAndStoresIntent() external {
        (MockAgentRequester platform, CompilerEngine compilerEngine, GoalRegistry goalRegistry,) = _deployHarness();

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 goalId = goalRegistry.postGoal{value: 0.6 ether}(
            "maximize USDC yield", address(0x1234), 1_000e6, 42161, constraints, block.timestamp + 1 days
        );

        _mockRatesCallback(platform, compilerEngine);
        _mockFilterCallback(platform, compilerEngine);

        Response[] memory responses = new Response[](1);
        responses[0].result = abi.encode(
            "{\"allocations\":[{\"chainName\":\"Base\",\"poolId\":\"aave-v3-usdc-base\",\"pct\":100}],\"reasoning\":\"highest APY\"}"
        );

        vm.prank(address(platform));
        compilerEngine.handlePlanResponse(3, responses, ResponseStatus.Success, _emptyRequest());

        (uint256 storedGoalId, CompilerEngine.CompileStep step, uint256 requestId,, bytes memory plan) =
            compilerEngine.compileStates(goalId);
        assertEq(storedGoalId, goalId);
        assertEq(uint256(step), uint256(CompilerEngine.CompileStep.Done));
        assertEq(requestId, 0);
        assertFalse(compilerEngine.pendingRequests(3));
        assertGt(plan.length, 0);
        assertEq(uint256(goalRegistry.getGoal(goalId).status), uint256(GoalRegistry.GoalStatus.IntentReady));
        assertGt(compilerEngine.intentStore().getIntent(goalId).length, 0);
        assertEq(goalRegistry.intentHashes(goalId), compilerEngine.intentStore().getIntentHash(goalId));

        CanonicalStandardOrder memory order =
            abi.decode(compilerEngine.intentStore().getIntent(goalId), (CanonicalStandardOrder));
        assertEq(order.user, address(this));
        assertEq(order.originChainId, 42161);
        assertEq(order.inputOracle, address(0x4001));
        assertEq(order.inputs.length, 1);
        assertEq(order.inputs[0][0], uint256(uint160(address(0x1234))));
        assertEq(order.inputs[0][1], 1_000e6);
        assertEq(order.outputs.length, 1);
        assertEq(order.outputs[0].oracle, _addressToBytes32(address(0x4001)));
        assertEq(order.outputs[0].settler, _addressToBytes32(address(0x3001)));
        assertEq(order.outputs[0].chainId, 8453);
        assertEq(order.outputs[0].token, _addressToBytes32(address(0x2001)));
        assertEq(order.outputs[0].amount, 1_000e6);
        assertEq(order.outputs[0].recipient, _addressToBytes32(address(this)));
        assertEq(order.outputs[0].callbackData.length, 0);
    }

    function testEncoderBuildsReceiverCallbackIntent() external {
        AddressRegistry addressRegistry = new AddressRegistry(address(this));
        address receiver = address(0x5001);
        bytes32 strategyId = keccak256("aave-v3-usdc-base:supply");

        addressRegistry.setInputSettler(42161, address(0x1001));
        addressRegistry.setVenue(
            "base",
            "aave-v3-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: address(0x2001),
                positionToken: address(0x2002),
                outputSettler: address(0x3001),
                oracle: address(0x4001),
                receiver: receiver,
                chainId: 8453,
                strategyId: strategyId,
                outputBps: 9_900,
                active: true
            })
        );
        StandardOrderEncoder encoder = new StandardOrderEncoder(address(addressRegistry));
        StandardOrderEncoder.Allocation[] memory allocations = new StandardOrderEncoder.Allocation[](1);
        allocations[0] = StandardOrderEncoder.Allocation({chainName: "base", poolId: "aave-v3-usdc-base", bps: 10_000});

        bytes memory encoded = encoder.encode(42, address(this), 42161, address(0x1234), 1_000e6, allocations);
        CanonicalStandardOrder memory order = abi.decode(encoded, (CanonicalStandardOrder));

        assertEq(order.outputs.length, 1);
        assertEq(order.outputs[0].token, _addressToBytes32(address(0x2001)));
        assertEq(order.outputs[0].amount, 990e6);
        assertEq(order.outputs[0].recipient, _addressToBytes32(receiver));

        StandardOrderEncoder.YieldAction memory action =
            abi.decode(order.outputs[0].callbackData, (StandardOrderEncoder.YieldAction));
        assertEq(action.goalId, 42);
        assertEq(action.beneficiary, address(this));
        assertEq(action.deliveryToken, address(0x2001));
        assertEq(action.positionToken, address(0x2002));
        assertEq(action.strategyId, strategyId);
        assertEq(action.minAmount, 990e6);
    }

    function testEncoderBuildsDirectCompoundVenueIntent() external {
        AddressRegistry addressRegistry = new AddressRegistry(address(this));
        address comet = address(0xC0);

        addressRegistry.setInputSettler(42161, address(0x1001));
        addressRegistry.setVenue(
            "base",
            "compound-v3-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: comet,
                positionToken: address(0),
                outputSettler: address(0x3001),
                oracle: address(0x4001),
                receiver: address(0),
                chainId: 8453,
                strategyId: bytes32(0),
                outputBps: 0,
                active: true
            })
        );

        StandardOrderEncoder encoder = new StandardOrderEncoder(address(addressRegistry));
        StandardOrderEncoder.Allocation[] memory allocations = new StandardOrderEncoder.Allocation[](1);
        allocations[0] =
            StandardOrderEncoder.Allocation({chainName: "base", poolId: "compound-v3-usdc-base", bps: 10_000});

        bytes memory encoded = encoder.encode(43, address(this), 42161, address(0x1234), 1_000e6, allocations);
        CanonicalStandardOrder memory order = abi.decode(encoded, (CanonicalStandardOrder));

        assertEq(order.outputs.length, 1);
        assertEq(order.outputs[0].token, _addressToBytes32(comet));
        assertEq(order.outputs[0].amount, 1_000e6);
        assertEq(order.outputs[0].recipient, _addressToBytes32(address(this)));
        assertEq(order.outputs[0].callbackData.length, 0);
    }

    function testPlanCallbackRejectsZeroPctAllocation() external {
        (MockAgentRequester platform, CompilerEngine compilerEngine, GoalRegistry goalRegistry,) = _deployHarness();

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 goalId = goalRegistry.postGoal{value: 0.6 ether}(
            "maximize USDC yield", address(0x1234), 1_000e6, 42161, constraints, block.timestamp + 1 days
        );

        _mockRatesCallback(platform, compilerEngine);
        _mockFilterCallback(platform, compilerEngine);

        Response[] memory responses = new Response[](1);
        responses[0].result = abi.encode(
            "{\"allocations\":[{\"chainName\":\"base\",\"poolId\":\"aave-v3-usdc-base\",\"pct\":100},{\"chainName\":\"ethereum\",\"poolId\":\"aave-v3-usdc-mainnet\",\"pct\":0}],\"reasoning\":\"zero output should fail\"}"
        );

        vm.prank(address(platform));
        compilerEngine.handlePlanResponse(3, responses, ResponseStatus.Success, _emptyRequest());

        (, CompilerEngine.CompileStep step,,,) = compilerEngine.compileStates(goalId);
        assertEq(uint256(step), uint256(CompilerEngine.CompileStep.Failed));
        assertEq(uint256(goalRegistry.getGoal(goalId).status), uint256(GoalRegistry.GoalStatus.Failed));
        assertEq(compilerEngine.intentStore().getIntentHash(goalId), bytes32(0));
    }

    function testPlanCallbackRejectsMultipleAllocationsForV1() external {
        (MockAgentRequester platform, CompilerEngine compilerEngine, GoalRegistry goalRegistry,) = _deployHarness();

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 goalId = goalRegistry.postGoal{value: 0.6 ether}(
            "safest USDC yield", address(0x1234), 1_000e6, 42161, constraints, block.timestamp + 1 days
        );

        _mockRatesCallback(platform, compilerEngine);
        _mockFilterCallback(platform, compilerEngine);

        Response[] memory responses = new Response[](1);
        responses[0].result = abi.encode(
            "{\"allocations\":[{\"chainName\":\"base\",\"poolId\":\"aave-v3-usdc-base\",\"pct\":50},{\"chainName\":\"ethereum\",\"poolId\":\"aave-v3-usdc-mainnet\",\"pct\":50}],\"reasoning\":\"split risk\"}"
        );

        vm.prank(address(platform));
        compilerEngine.handlePlanResponse(3, responses, ResponseStatus.Success, _emptyRequest());

        (, CompilerEngine.CompileStep step,,,) = compilerEngine.compileStates(goalId);
        assertEq(uint256(step), uint256(CompilerEngine.CompileStep.Failed));
        assertEq(uint256(goalRegistry.getGoal(goalId).status), uint256(GoalRegistry.GoalStatus.Failed));
        assertEq(compilerEngine.intentStore().getIntentHash(goalId), bytes32(0));
    }

    function testPlanCallbackRejectsReasoningInsideAllocationsArray() external {
        (MockAgentRequester platform, CompilerEngine compilerEngine, GoalRegistry goalRegistry,) = _deployHarness();

        string[] memory constraints = new string[](1);
        constraints[0] = "risk-low";

        uint256 goalId = goalRegistry.postGoal{value: 0.6 ether}(
            "maximize USDC yield", address(0x1234), 1_000e6, 42161, constraints, block.timestamp + 1 days
        );

        _mockRatesCallback(platform, compilerEngine);
        _mockFilterCallback(platform, compilerEngine);

        Response[] memory responses = new Response[](1);
        responses[0].result = abi.encode(
            "{\"allocations\":[{\"chainName\":\"base\",\"poolId\":\"aave-v3-usdc-base\",\"pct\":100},\"reasoning\":\"malformed\"]}"
        );

        vm.prank(address(platform));
        compilerEngine.handlePlanResponse(3, responses, ResponseStatus.Success, _emptyRequest());

        (, CompilerEngine.CompileStep step,,,) = compilerEngine.compileStates(goalId);
        assertEq(uint256(step), uint256(CompilerEngine.CompileStep.Failed));
        assertEq(uint256(goalRegistry.getGoal(goalId).status), uint256(GoalRegistry.GoalStatus.Failed));
        assertEq(compilerEngine.intentStore().getIntentHash(goalId), bytes32(0));
    }

    function _deployHarness()
        private
        returns (
            MockAgentRequester platform,
            CompilerEngine compilerEngine,
            GoalRegistry goalRegistry,
            ReceiptLogContract receiptLog
        )
    {
        platform = new MockAgentRequester();
        AddressRegistry addressRegistry = new AddressRegistry(address(this));
        addressRegistry.setInputSettler(42161, address(0x1001));
        addressRegistry.setVenue(
            "base",
            "aave-v3-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: address(0x2001),
                positionToken: address(0),
                outputSettler: address(0x3001),
                oracle: address(0x4001),
                receiver: address(0),
                chainId: 8453,
                strategyId: bytes32(0),
                outputBps: 0,
                active: true
            })
        );
        addressRegistry.setVenue(
            "ethereum",
            "aave-v3-usdc-mainnet",
            AddressRegistry.VenueConfig({
                deliveryToken: address(0x2002),
                positionToken: address(0),
                outputSettler: address(0x3002),
                oracle: address(0x4001),
                receiver: address(0),
                chainId: 1,
                strategyId: bytes32(0),
                outputBps: 0,
                active: true
            })
        );
        StandardOrderEncoder encoder = new StandardOrderEncoder(address(addressRegistry));
        receiptLog = new ReceiptLogContract(address(this), address(0));
        IntentStore intentStore = new IntentStore(address(this), address(0));
        goalRegistry = new GoalRegistry(address(this), address(0));
        compilerEngine = new CompilerEngine(
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
    }

    function _mockRatesCallback(MockAgentRequester platform, CompilerEngine compilerEngine) private {
        Response[] memory responses = new Response[](1);
        responses[0].result = abi.encode("poolId=aave-v3-usdc-base,apy=3.2|poolId=aave-v3-usdc-mainnet,apy=3.3");

        vm.prank(address(platform));
        compilerEngine.handleRatesResponse(1, responses, ResponseStatus.Success, _emptyRequest());
    }

    function _mockFilterCallback(MockAgentRequester platform, CompilerEngine compilerEngine) private {
        Response[] memory responses = new Response[](1);
        responses[0].result = abi.encode("aave-v3-usdc-base,aave-v3-usdc-mainnet");

        vm.prank(address(platform));
        compilerEngine.handleFilterResponse(2, responses, ResponseStatus.Success, _emptyRequest());
    }

    function _emptyRequest() private pure returns (Request memory request) {}

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }
}
