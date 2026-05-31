// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICompilerEngine {
    function startCompile(uint256 goalId) external payable;
}

contract GoalRegistry {
    enum GoalStatus {
        Pending,
        Compiling,
        IntentReady,
        Submitted,
        Settled,
        Failed,
        Expired
    }

    struct Goal {
        address author;
        string naturalLanguage;
        address sourceAsset;
        uint256 sourceAmount;
        uint256 sourceChainId;
        string[] constraints;
        uint256 deadline;
        GoalStatus status;
        uint256 createdAt;
    }

    mapping(uint256 => Goal) private goals;
    mapping(uint256 => bytes32) public intentHashes;
    mapping(uint256 => string) public catalystOrderIds;
    uint256 public nextGoalId;
    address public owner;
    address public compilerEngine;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event CompilerEngineSet(address indexed compilerEngine);
    event GoalPosted(
        uint256 indexed goalId,
        address indexed author,
        address sourceAsset,
        uint256 sourceAmount,
        uint256 sourceChainId,
        uint256 deadline
    );
    event GoalStatusChanged(uint256 indexed goalId, GoalStatus status);
    event IntentReady(uint256 indexed goalId, bytes32 indexed intentHash);
    event IntentSubmitted(uint256 indexed goalId, string catalystOrderId);

    modifier onlyCompilerEngine() {
        require(msg.sender == compilerEngine, "Only compiler");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address initialOwner, address initialCompilerEngine) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
        compilerEngine = initialCompilerEngine;
        emit OwnershipTransferred(address(0), owner);
        emit CompilerEngineSet(initialCompilerEngine);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setCompilerEngine(address newCompilerEngine) external onlyOwner {
        compilerEngine = newCompilerEngine;
        emit CompilerEngineSet(newCompilerEngine);
    }

    function postGoal(
        string calldata nl,
        address asset,
        uint256 amount,
        uint256 chainId,
        string[] calldata constraints,
        uint256 deadline
    ) external payable returns (uint256 goalId) {
        require(bytes(nl).length > 0, "Empty goal");
        require(amount > 0, "Zero amount");
        require(chainId != 0, "Zero chain");
        require(deadline == 0 || deadline > block.timestamp, "Expired deadline");

        goalId = nextGoalId++;
        Goal storage goal = goals[goalId];
        goal.author = msg.sender;
        goal.naturalLanguage = nl;
        goal.sourceAsset = asset;
        goal.sourceAmount = amount;
        goal.sourceChainId = chainId;
        goal.deadline = deadline;
        goal.status = GoalStatus.Pending;
        goal.createdAt = block.timestamp;

        for (uint256 i = 0; i < constraints.length; i++) {
            goal.constraints.push(constraints[i]);
        }

        emit GoalPosted(goalId, msg.sender, asset, amount, chainId, deadline);

        if (compilerEngine != address(0)) {
            goal.status = GoalStatus.Compiling;
            emit GoalStatusChanged(goalId, GoalStatus.Compiling);
            ICompilerEngine(compilerEngine).startCompile{value: msg.value}(goalId);
        }
    }

    function getGoal(uint256 goalId) external view returns (Goal memory) {
        return goals[goalId];
    }

    function markIntentReady(uint256 goalId, bytes32 intentHash) external onlyCompilerEngine {
        Goal storage goal = goals[goalId];
        require(goal.author != address(0), "Unknown goal");
        goal.status = GoalStatus.IntentReady;
        intentHashes[goalId] = intentHash;
        emit IntentReady(goalId, intentHash);
        emit GoalStatusChanged(goalId, GoalStatus.IntentReady);
    }

    function markSubmitted(uint256 goalId, string calldata catalystOrderId) external {
        Goal storage goal = goals[goalId];
        require(msg.sender == goal.author, "Only author");
        require(goal.status == GoalStatus.IntentReady, "Intent not ready");
        require(bytes(catalystOrderId).length > 0, "Empty order id");

        goal.status = GoalStatus.Submitted;
        catalystOrderIds[goalId] = catalystOrderId;
        emit IntentSubmitted(goalId, catalystOrderId);
        emit GoalStatusChanged(goalId, GoalStatus.Submitted);
    }

    function markFailed(uint256 goalId) external onlyCompilerEngine {
        Goal storage goal = goals[goalId];
        require(goal.author != address(0), "Unknown goal");
        goal.status = GoalStatus.Failed;
        emit GoalStatusChanged(goalId, GoalStatus.Failed);
    }

    receive() external payable {}
}
