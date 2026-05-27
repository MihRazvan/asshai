// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/IAgentRequester.sol";
import {IntentRegistry} from "./IntentRegistry.sol";
import {PlanVault} from "./PlanVault.sol";
import {ReceiptLog as ReceiptLogContract} from "./ReceiptLog.sol";

contract SolverEngine {
    enum SolveStep {
        Idle,
        FetchingRates,
        FilteringPools,
        BuildingPlan,
        Done,
        Failed
    }

    struct SolveState {
        uint256 intentId;
        SolveStep step;
        uint256 currentAgentRequestId;
        bytes ratesPayload;
        string[] candidatePools;
        bytes finalPlan;
    }

    IAgentRequester public platform;
    IntentRegistry public intentRegistry;
    PlanVault public planVault;
    ReceiptLogContract public receiptLog;

    mapping(uint256 => SolveState) public solveStates;
    mapping(uint256 => bool) public pendingRequests;
    mapping(uint256 => uint256) public requestToIntent;

    event SolveStarted(uint256 indexed intentId);
    event SolveFailed(uint256 indexed intentId, uint256 indexed requestId, ResponseStatus status);
    event PlanReady(uint256 indexed intentId, bytes32 planHash);

    modifier onlyIntentRegistry() {
        require(msg.sender == address(intentRegistry), "Only registry");
        _;
    }

    constructor(
        address platformAddress,
        address registryAddress,
        address receiptLogAddress,
        address planVaultAddress
    ) {
        platform = IAgentRequester(platformAddress);
        intentRegistry = IntentRegistry(payable(registryAddress));
        receiptLog = ReceiptLogContract(receiptLogAddress);
        planVault = PlanVault(planVaultAddress);
    }

    function startSolve(uint256 intentId) external payable onlyIntentRegistry {
        SolveState storage state = solveStates[intentId];
        state.intentId = intentId;
        state.step = SolveStep.Idle;

        emit SolveStarted(intentId);
    }

    function handleRatesResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handleStubbedCallback(requestId, responses, status, details);
    }

    function handleFilterResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handleStubbedCallback(requestId, responses, status, details);
    }

    function handlePlanResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handleStubbedCallback(requestId, responses, status, details);
    }

    function _handleStubbedCallback(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) private {
        require(msg.sender == address(platform), "Only platform can call");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];
        uint256 intentId = requestToIntent[requestId];
        delete requestToIntent[requestId];

        if (status == ResponseStatus.Failed || status == ResponseStatus.TimedOut) {
            solveStates[intentId].step = SolveStep.Failed;
            intentRegistry.markFailed(intentId);
            emit SolveFailed(intentId, requestId, status);
            return;
        }

        if (status == ResponseStatus.Success && responses.length > 0) {
            receiptLog.log(intentId, "stub_response", responses[0].result, requestId);
        }
    }

    receive() external payable {}
}
