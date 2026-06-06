// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/IAgentRequester.sol";
import {IJsonApiAgent} from "./interfaces/IJsonApiAgent.sol";
import {ILlmInferenceAgent} from "./interfaces/ILlmInferenceAgent.sol";
import {GoalRegistry} from "./GoalRegistry.sol";
import {IntentStore} from "./IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "./ReceiptLog.sol";
import {SomniaConfig} from "./SomniaConfig.sol";
import {StandardOrderEncoder} from "./StandardOrderEncoder.sol";

contract CompilerEngineV2 {
    enum CompileStep {
        Idle,
        FetchingRates,
        SelectingPool,
        EncodingOrder,
        Done,
        Failed
    }

    struct CompileState {
        uint256 goalId;
        CompileStep step;
        uint256 currentAgentRequestId;
        bytes ratesPayload;
        string selectedPoolId;
        bytes allocationPlan;
    }

    IAgentRequester public platform;
    GoalRegistry public goalRegistry;
    ReceiptLogContract public receiptLog;
    IntentStore public intentStore;
    StandardOrderEncoder public standardOrderEncoder;
    address public owner;
    string public ratesUrl;
    string public ratesSelector;

    mapping(uint256 => CompileState) public compileStates;
    mapping(uint256 => bool) public pendingRequests;
    mapping(uint256 => uint256) public requestToGoal;

    event CompileStarted(uint256 indexed goalId);
    event CompileFailed(uint256 indexed goalId, uint256 indexed requestId, ResponseStatus status);
    event RatesSourceSet(string url, string selector);
    event RatesRequestCreated(uint256 indexed goalId, uint256 indexed requestId);
    event RatesFetched(uint256 indexed goalId, uint256 indexed requestId, bytes payload);
    event PoolSelectionRequestCreated(uint256 indexed goalId, uint256 indexed requestId);
    event PoolSelected(uint256 indexed goalId, uint256 indexed requestId, string poolId);
    event PlanBuilt(uint256 indexed goalId, uint256 indexed requestId, string allocationPlan);
    event IntentReady(uint256 indexed goalId, bytes32 indexed intentHash);

    modifier onlyGoalRegistry() {
        require(msg.sender == address(goalRegistry), "Only registry");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(
        address platformAddress,
        address goalRegistryAddress,
        address receiptLogAddress,
        address intentStoreAddress,
        address standardOrderEncoderAddress,
        string memory initialRatesUrl,
        string memory initialRatesSelector
    ) {
        require(platformAddress != address(0), "Zero platform");
        owner = msg.sender;
        platform = IAgentRequester(platformAddress);
        goalRegistry = GoalRegistry(payable(goalRegistryAddress));
        receiptLog = ReceiptLogContract(receiptLogAddress);
        intentStore = IntentStore(intentStoreAddress);
        standardOrderEncoder = StandardOrderEncoder(standardOrderEncoderAddress);
        ratesUrl = initialRatesUrl;
        ratesSelector = initialRatesSelector;
        emit RatesSourceSet(initialRatesUrl, initialRatesSelector);
    }

    function setRatesSource(string calldata newRatesUrl, string calldata newRatesSelector) external onlyOwner {
        require(bytes(newRatesUrl).length > 0, "Empty URL");
        require(bytes(newRatesSelector).length > 0, "Empty selector");
        ratesUrl = newRatesUrl;
        ratesSelector = newRatesSelector;
        emit RatesSourceSet(newRatesUrl, newRatesSelector);
    }

    function startCompile(uint256 goalId) external payable onlyGoalRegistry {
        require(bytes(ratesUrl).length > 0, "Missing rates URL");
        require(bytes(ratesSelector).length > 0, "Missing rates selector");

        CompileState storage state = compileStates[goalId];
        state.goalId = goalId;
        state.step = CompileStep.FetchingRates;

        uint256 deposit = _jsonRequestDeposit();
        require(msg.value >= deposit, "Insufficient compile fee");

        bytes memory payload = abi.encodeWithSelector(IJsonApiAgent.fetchString.selector, ratesUrl, ratesSelector);
        uint256 requestId = platform.createRequest{value: deposit}(
            SomniaConfig.JSON_API_AGENT_ID, address(this), this.handleRatesResponse.selector, payload
        );

        state.currentAgentRequestId = requestId;
        pendingRequests[requestId] = true;
        requestToGoal[requestId] = goalId;

        emit CompileStarted(goalId);
        emit RatesRequestCreated(goalId, requestId);
    }

    function handleRatesResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(platform), "Only platform");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];
        uint256 goalId = requestToGoal[requestId];
        delete requestToGoal[requestId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            _fail(goalId, requestId, status);
            return;
        }

        string memory rates = abi.decode(responses[0].result, (string));
        CompileState storage state = compileStates[goalId];
        state.ratesPayload = abi.encode(rates);
        state.step = CompileStep.SelectingPool;

        receiptLog.log(goalId, "rates_fetched", abi.encode(rates), requestId);
        emit RatesFetched(goalId, requestId, abi.encode(rates));

        _requestPoolSelection(goalId, rates);
    }

    function handlePoolSelectionResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(platform), "Only platform");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];
        uint256 goalId = requestToGoal[requestId];
        delete requestToGoal[requestId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            _fail(goalId, requestId, status);
            return;
        }

        string memory selectedPoolId = _trim(abi.decode(responses[0].result, (string)));
        if (!_isSupportedPool(selectedPoolId)) {
            _fail(goalId, requestId, ResponseStatus.Failed);
            return;
        }

        CompileState storage state = compileStates[goalId];
        state.selectedPoolId = selectedPoolId;
        state.step = CompileStep.EncodingOrder;
        receiptLog.log(goalId, "candidates_selected", abi.encode(selectedPoolId), requestId);
        emit PoolSelected(goalId, requestId, selectedPoolId);

        _encodeSingleAllocation(goalId, selectedPoolId, requestId);
    }

    function _requestPoolSelection(uint256 goalId, string memory compactPoolData) private {
        GoalRegistry.Goal memory goal = goalRegistry.getGoal(goalId);
        string memory prompt = string.concat(
            "You are a DeFi yield router for a single-allocation compiler. ",
            "Choose exactly one pool ID from the candidates. Return ONLY the pool ID, no commas, no markdown.\n\n",
            "Goal: \"",
            goal.naturalLanguage,
            "\"\nConstraints: ",
            _joinConstraints(goal.constraints),
            "\n\nCandidates:\n",
            compactPoolData,
            "\n\nSelection:"
        );

        uint256 deposit = _llmRequestDeposit();
        require(address(this).balance >= deposit, "Insufficient LLM fee");

        string[] memory allowedValues = new string[](0);
        bytes memory payload = abi.encodeWithSelector(
            ILlmInferenceAgent.inferString.selector,
            prompt,
            "Select one verified pool ID for a stablecoin yield intent compiler.",
            false,
            allowedValues
        );

        uint256 selectionRequestId = platform.createRequest{value: deposit}(
            SomniaConfig.LLM_INFERENCE_AGENT_ID, address(this), this.handlePoolSelectionResponse.selector, payload
        );

        CompileState storage state = compileStates[goalId];
        state.currentAgentRequestId = selectionRequestId;
        pendingRequests[selectionRequestId] = true;
        requestToGoal[selectionRequestId] = goalId;

        emit PoolSelectionRequestCreated(goalId, selectionRequestId);
    }

    function _encodeSingleAllocation(uint256 goalId, string memory poolId, uint256 requestId) private {
        string memory plan = string.concat(
            "{\"allocations\":[{\"chainName\":\"base\",\"poolId\":\"",
            poolId,
            "\",\"pct\":100}],\"reasoning\":\"selected best verified single venue\"}"
        );

        CompileState storage state = compileStates[goalId];
        state.allocationPlan = abi.encode(plan);
        receiptLog.log(goalId, "plan_built", abi.encode(plan), requestId);
        emit PlanBuilt(goalId, requestId, plan);

        StandardOrderEncoder.Allocation[] memory allocations = new StandardOrderEncoder.Allocation[](1);
        allocations[0] = StandardOrderEncoder.Allocation({chainName: "base", poolId: poolId, bps: 10_000});

        GoalRegistry.Goal memory goal = goalRegistry.getGoal(goalId);
        try standardOrderEncoder.encode(
            goalId, goal.author, goal.sourceChainId, goal.sourceAsset, goal.sourceAmount, allocations
        ) returns (bytes memory encodedIntent) {
            intentStore.store(goalId, encodedIntent);
            bytes32 intentHash = intentStore.getIntentHash(goalId);
            state.currentAgentRequestId = 0;
            state.step = CompileStep.Done;
            receiptLog.log(goalId, "order_encoded", encodedIntent, 0);
            goalRegistry.markIntentReady(goalId, intentHash);
            emit IntentReady(goalId, intentHash);
        } catch {
            _fail(goalId, requestId, ResponseStatus.Failed);
        }
    }

    function _isSupportedPool(string memory poolId) private pure returns (bool) {
        return _stringEq(poolId, "aave-v3-usdc-base") || _stringEq(poolId, "compound-v3-usdc-base");
    }

    function _fail(uint256 goalId, uint256 requestId, ResponseStatus status) private {
        CompileState storage state = compileStates[goalId];
        state.currentAgentRequestId = 0;
        state.step = CompileStep.Failed;
        goalRegistry.markFailed(goalId);
        emit CompileFailed(goalId, requestId, status);
    }

    function _jsonRequestDeposit() private view returns (uint256) {
        return
            platform.getRequestDeposit()
                + SomniaConfig.JSON_API_COST_PER_AGENT * SomniaConfig.DEFAULT_SUBCOMMITTEE_SIZE;
    }

    function _llmRequestDeposit() private view returns (uint256) {
        return
            platform.getRequestDeposit()
                + SomniaConfig.LLM_INFERENCE_COST_PER_AGENT * SomniaConfig.DEFAULT_SUBCOMMITTEE_SIZE;
    }

    function _joinConstraints(string[] memory constraints) private pure returns (string memory joined) {
        for (uint256 i = 0; i < constraints.length; i++) {
            joined = i == 0 ? constraints[i] : string.concat(joined, ", ", constraints[i]);
        }
    }

    function _trim(string memory value) private pure returns (string memory) {
        bytes memory data = bytes(value);
        if (data.length == 0) return value;

        uint256 start;
        uint256 end = data.length;
        while (start < end && _isWhitespace(data[start])) start++;
        while (end > start && _isWhitespace(data[end - 1])) end--;

        bytes memory output = new bytes(end - start);
        for (uint256 i = 0; i < output.length; i++) {
            output[i] = data[start + i];
        }
        return string(output);
    }

    function _isWhitespace(bytes1 char) private pure returns (bool) {
        return char == 0x20 || char == 0x09 || char == 0x0a || char == 0x0d;
    }

    function _stringEq(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    receive() external payable {}
}
