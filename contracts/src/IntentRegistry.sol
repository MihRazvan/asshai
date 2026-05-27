// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISolverEngine {
    function startSolve(uint256 intentId) external payable;
}

contract IntentRegistry {
    enum IntentStatus {
        Pending,
        Solving,
        PlanReady,
        Executed,
        Failed,
        Expired
    }

    struct Intent {
        address author;
        string naturalLanguage;
        address sourceAsset;
        uint256 sourceAmount;
        uint256 sourceChainId;
        string[] constraints;
        uint256 deadline;
        IntentStatus status;
        uint256 createdAt;
        address solver;
    }

    mapping(uint256 => Intent) private intents;
    uint256 public nextIntentId;
    address public solverEngine;

    event SolverEngineSet(address indexed solverEngine);
    event IntentPosted(
        uint256 indexed intentId,
        address indexed author,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 sourceChainId,
        uint256 deadline
    );
    event IntentStatusChanged(uint256 indexed intentId, IntentStatus status);
    event IntentExecuted(uint256 indexed intentId, bytes32 lifiTxHash);

    modifier onlySolverEngine() {
        require(msg.sender == solverEngine, "Only solver");
        _;
    }

    constructor(address initialSolverEngine) {
        solverEngine = initialSolverEngine;
        emit SolverEngineSet(initialSolverEngine);
    }

    function setSolverEngine(address newSolverEngine) external {
        require(solverEngine == address(0) || msg.sender == solverEngine, "Only solver");
        solverEngine = newSolverEngine;
        emit SolverEngineSet(newSolverEngine);
    }

    function postIntent(
        string calldata nl,
        address asset,
        uint256 amount,
        uint256 chainId,
        string[] calldata constraints,
        uint256 deadline
    ) external payable returns (uint256 intentId) {
        require(bytes(nl).length > 0, "Empty intent");
        require(deadline == 0 || deadline > block.timestamp, "Expired deadline");

        intentId = nextIntentId++;
        Intent storage intent = intents[intentId];
        intent.author = msg.sender;
        intent.naturalLanguage = nl;
        intent.sourceAsset = asset;
        intent.sourceAmount = amount;
        intent.sourceChainId = chainId;
        intent.deadline = deadline;
        intent.status = IntentStatus.Pending;
        intent.createdAt = block.timestamp;
        intent.solver = solverEngine;

        for (uint256 i = 0; i < constraints.length; i++) {
            intent.constraints.push(constraints[i]);
        }

        emit IntentPosted(intentId, msg.sender, asset, amount, chainId, deadline);

        if (solverEngine != address(0)) {
            intent.status = IntentStatus.Solving;
            emit IntentStatusChanged(intentId, IntentStatus.Solving);
            ISolverEngine(solverEngine).startSolve{value: msg.value}(intentId);
        }
    }

    function getIntent(uint256 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }

    function markPlanReady(uint256 intentId) external onlySolverEngine {
        intents[intentId].status = IntentStatus.PlanReady;
        emit IntentStatusChanged(intentId, IntentStatus.PlanReady);
    }

    function markFailed(uint256 intentId) external onlySolverEngine {
        intents[intentId].status = IntentStatus.Failed;
        emit IntentStatusChanged(intentId, IntentStatus.Failed);
    }

    function markExecuted(uint256 intentId, bytes32 lifiTxHash) external {
        Intent storage intent = intents[intentId];
        require(msg.sender == intent.author, "Only author");
        require(intent.status == IntentStatus.PlanReady, "Plan not ready");

        intent.status = IntentStatus.Executed;
        emit IntentExecuted(intentId, lifiTxHash);
        emit IntentStatusChanged(intentId, IntentStatus.Executed);
    }

    receive() external payable {}
}

