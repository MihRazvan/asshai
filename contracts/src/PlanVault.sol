// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PlanVault {
    struct Allocation {
        string poolId;
        uint256 chainId;
        address vaultToken;
        uint16 bps;
    }

    struct Plan {
        uint256 intentId;
        Allocation[] allocations;
        uint256 builtAt;
        bytes32 reasoningHash;
    }

    address public solverEngine;
    mapping(uint256 => Plan) private plans;

    event SolverEngineSet(address indexed solverEngine);
    event PlanStored(uint256 indexed intentId, bytes32 reasoningHash);

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

    function setPlan(
        uint256 intentId,
        Allocation[] calldata allocs,
        bytes32 reasoningHash
    ) external onlySolverEngine {
        delete plans[intentId].allocations;

        Plan storage plan = plans[intentId];
        plan.intentId = intentId;
        plan.builtAt = block.timestamp;
        plan.reasoningHash = reasoningHash;

        uint256 totalBps;
        for (uint256 i = 0; i < allocs.length; i++) {
            plan.allocations.push(allocs[i]);
            totalBps += allocs[i].bps;
        }

        require(allocs.length == 0 || totalBps == 10_000, "Invalid bps");
        emit PlanStored(intentId, reasoningHash);
    }

    function getPlan(uint256 intentId) external view returns (Plan memory) {
        return plans[intentId];
    }
}

