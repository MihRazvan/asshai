// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct OnchainTool {
    string signature;
    string description;
}

interface ILlmInferenceAgent {
    function inferString(
        string calldata prompt,
        string calldata system,
        bool chainOfThought,
        string[] calldata allowedValues
    ) external returns (string memory response);

    function inferNumber(
        string calldata prompt,
        string calldata system,
        int256 minValue,
        int256 maxValue,
        bool chainOfThought
    ) external returns (int256 response);

    function inferChat(
        string[] calldata roles,
        string[] calldata messages,
        bool chainOfThought
    ) external returns (string memory response);

    function inferToolsChat(
        string[] calldata roles,
        string[] calldata messages,
        string[] calldata mcpServerUrls,
        OnchainTool[] calldata onchainTools,
        uint256 maxIterations,
        bool chainOfThought
    )
        external
        returns (
            string memory finishReason,
            string memory response,
            string[] memory updatedRoles,
            string[] memory updatedMessages,
            string[] memory pendingToolCallIds,
            bytes[] memory pendingToolCalls
        );
}

