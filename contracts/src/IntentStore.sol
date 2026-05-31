// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract IntentStore {
    address public owner;
    address public compilerEngine;
    mapping(uint256 => bytes) private encodedIntents;
    mapping(uint256 => bytes32) public intentHashes;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event CompilerEngineSet(address indexed compilerEngine);
    event IntentStored(uint256 indexed goalId, bytes32 indexed intentHash);

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

    function store(uint256 goalId, bytes calldata encoded) external onlyCompilerEngine {
        bytes32 intentHash = keccak256(encoded);
        encodedIntents[goalId] = encoded;
        intentHashes[goalId] = intentHash;
        emit IntentStored(goalId, intentHash);
    }

    function getIntent(uint256 goalId) external view returns (bytes memory) {
        return encodedIntents[goalId];
    }

    function getIntentHash(uint256 goalId) external view returns (bytes32) {
        return intentHashes[goalId];
    }
}
