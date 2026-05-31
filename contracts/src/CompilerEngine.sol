// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/IAgentRequester.sol";
import {GoalRegistry} from "./GoalRegistry.sol";
import {IntentStore} from "./IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "./ReceiptLog.sol";
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

    mapping(uint256 => CompileState) public compileStates;
    mapping(uint256 => bool) public pendingRequests;
    mapping(uint256 => uint256) public requestToGoal;

    event CompileStarted(uint256 indexed goalId);
    event CompileFailed(uint256 indexed goalId, uint256 indexed requestId, ResponseStatus status);
    event IntentReady(uint256 indexed goalId, bytes32 indexed intentHash);

    modifier onlyGoalRegistry() {
        require(msg.sender == address(goalRegistry), "Only registry");
        _;
    }

    constructor(
        address platformAddress,
        address goalRegistryAddress,
        address receiptLogAddress,
        address intentStoreAddress,
        address standardOrderEncoderAddress
    ) {
        require(platformAddress != address(0), "Zero platform");
        platform = IAgentRequester(platformAddress);
        goalRegistry = GoalRegistry(payable(goalRegistryAddress));
        receiptLog = ReceiptLogContract(receiptLogAddress);
        intentStore = IntentStore(intentStoreAddress);
        standardOrderEncoder = StandardOrderEncoder(standardOrderEncoderAddress);
    }

    function startCompile(uint256 goalId) external payable onlyGoalRegistry {
        CompileState storage state = compileStates[goalId];
        state.goalId = goalId;
        state.step = CompileStep.Idle;

        emit CompileStarted(goalId);
    }

    function handleRatesResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handleStubbedCallback(requestId, responses, status, details, "rates_fetched");
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

    receive() external payable {}
}
