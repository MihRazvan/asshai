// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReceiptLog {
    struct ReceiptEntry {
        uint256 goalId;
        uint256 timestamp;
        string stepName;
        bytes data;
        uint256 agentRequestId;
    }

    address public owner;
    address public compilerEngine;
    mapping(uint256 => ReceiptEntry[]) private entriesByGoal;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event CompilerEngineSet(address indexed compilerEngine);
    event ReceiptLogged(uint256 indexed goalId, string step, uint256 requestId);

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

    function log(
        uint256 goalId,
        string calldata step,
        bytes calldata data,
        uint256 requestId
    ) external onlyCompilerEngine {
        entriesByGoal[goalId].push(
            ReceiptEntry({
                goalId: goalId,
                timestamp: block.timestamp,
                stepName: step,
                data: data,
                agentRequestId: requestId
            })
        );

        emit ReceiptLogged(goalId, step, requestId);
    }

    function getEntries(uint256 goalId) external view returns (ReceiptEntry[] memory) {
        return entriesByGoal[goalId];
    }
}
