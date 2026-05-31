// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/IAgentRequester.sol";
import {IJsonApiAgent} from "./interfaces/IJsonApiAgent.sol";
import {GoalRegistry} from "./GoalRegistry.sol";
import {IntentStore} from "./IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "./ReceiptLog.sol";
import {SomniaConfig} from "./SomniaConfig.sol";
import {StandardOrderEncoder} from "./StandardOrderEncoder.sol";

contract CompilerEngine {
    enum CompileStep {
        Idle,
        FetchingRates,
        FilteringPools,
        BuildingPlan,
        EncodingOrder,
        Done,
        Failed
    }

    struct CompileState {
        uint256 goalId;
        CompileStep step;
        uint256 currentAgentRequestId;
        bytes ratesPayload;
        string[] candidatePoolIds;
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

    function setRatesSource(
        string calldata newRatesUrl,
        string calldata newRatesSelector
    ) external onlyOwner {
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

        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchString.selector,
            ratesUrl,
            ratesSelector
        );
        uint256 deposit = platform.getRequestDeposit()
            + (SomniaConfig.JSON_API_COST_PER_AGENT * SomniaConfig.DEFAULT_SUBCOMMITTEE_SIZE);
        require(msg.value >= deposit, "Insufficient compile fee");

        uint256 requestId = platform.createRequest{value: deposit}(
            SomniaConfig.JSON_API_AGENT_ID,
            address(this),
            this.handleRatesResponse.selector,
            payload
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
        Request memory details
    ) external {
        _handleRatesCallback(requestId, responses, status, details);
    }

    function handleFilterResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handleStubbedCallback(requestId, responses, status, details, "candidates_selected");
    }

    function handlePlanResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handleStubbedCallback(requestId, responses, status, details, "plan_built");
    }

    function _handleStubbedCallback(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */,
        string memory stepName
    ) private {
        require(msg.sender == address(platform), "Only platform can call");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];
        uint256 goalId = requestToGoal[requestId];
        delete requestToGoal[requestId];

        if (status == ResponseStatus.Failed || status == ResponseStatus.TimedOut) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        if (status == ResponseStatus.Success && responses.length > 0) {
            receiptLog.log(goalId, stepName, responses[0].result, requestId);
        }
    }

    function _handleRatesCallback(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) private {
        require(msg.sender == address(platform), "Only platform can call");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];
        uint256 goalId = requestToGoal[requestId];
        delete requestToGoal[requestId];

        if (status == ResponseStatus.Failed || status == ResponseStatus.TimedOut) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        if (status != ResponseStatus.Success || responses.length == 0) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        bytes memory ratesPayload = abi.encode(abi.decode(responses[0].result, (string)));
        CompileState storage state = compileStates[goalId];
        state.ratesPayload = ratesPayload;
        state.currentAgentRequestId = 0;
        state.step = CompileStep.FilteringPools;

        receiptLog.log(goalId, "rates_fetched", ratesPayload, requestId);
        emit RatesFetched(goalId, requestId, ratesPayload);
    }

    receive() external payable {}
}
