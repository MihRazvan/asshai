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

    address public compilerEngine;
    mapping(uint256 => ReceiptEntry[]) private entriesByGoal;

    event CompilerEngineSet(address indexed compilerEngine);
    event ReceiptLogged(uint256 indexed goalId, string step, uint256 requestId);

    modifier onlyCompilerEngine() {
        require(msg.sender == compilerEngine, "Only compiler");
        _;
    }

    constructor(address initialCompilerEngine) {
        compilerEngine = initialCompilerEngine;
        emit CompilerEngineSet(initialCompilerEngine);
    }

    function setCompilerEngine(address newCompilerEngine) external {
        require(compilerEngine == address(0) || msg.sender == compilerEngine, "Only compiler");
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
