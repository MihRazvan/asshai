// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReceiptLog {
    struct ReceiptEntry {
        uint256 intentId;
        uint256 timestamp;
        string stepName;
        bytes data;
        uint256 agentRequestId;
    }

    address public solverEngine;
    mapping(uint256 => ReceiptEntry[]) private entriesByIntent;

    event SolverEngineSet(address indexed solverEngine);
    event ReceiptLogged(uint256 indexed intentId, string step, uint256 requestId);

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

    function log(
        uint256 intentId,
        string calldata step,
        bytes calldata data,
        uint256 requestId
    ) external onlySolverEngine {
        entriesByIntent[intentId].push(
            ReceiptEntry({
                intentId: intentId,
                timestamp: block.timestamp,
                stepName: step,
                data: data,
                agentRequestId: requestId
            })
        );

        emit ReceiptLogged(intentId, step, requestId);
    }

    function getEntries(uint256 intentId) external view returns (ReceiptEntry[] memory) {
        return entriesByIntent[intentId];
    }
}

