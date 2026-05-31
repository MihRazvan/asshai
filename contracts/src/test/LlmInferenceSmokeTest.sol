// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "../interfaces/IAgentRequester.sol";
import {ILlmInferenceAgent} from "../interfaces/ILlmInferenceAgent.sol";
import {SomniaConfig} from "../SomniaConfig.sol";

contract LlmInferenceSmokeTest {
    IAgentRequester public platform =
        IAgentRequester(SomniaConfig.TESTNET_PLATFORM);

    uint256 public constant LLM_INFERENCE_AGENT_ID = SomniaConfig.LLM_INFERENCE_AGENT_ID;
    uint256 public constant SUBCOMMITTEE_SIZE = SomniaConfig.DEFAULT_SUBCOMMITTEE_SIZE;
    uint256 public constant LLM_COST_PER_AGENT = SomniaConfig.LLM_INFERENCE_COST_PER_AGENT;

    string public latestResponse;
    mapping(uint256 => bool) public pendingRequests;

    event InferenceRequested(uint256 indexed requestId);
    event InferenceReceived(uint256 indexed requestId, string response);
    event AgentFailed(uint256 indexed requestId);
    event AgentTimedOut(uint256 indexed requestId);
    event EmptyResponse(uint256 indexed requestId);

    function requestDeterministicOk() external payable returns (uint256 requestId) {
        string[] memory allowedValues = new string[](1);
        allowedValues[0] = "OK";

        bytes memory payload = abi.encodeWithSelector(
            ILlmInferenceAgent.inferString.selector,
            "Return exactly OK and nothing else.",
            "You are a deterministic test responder.",
            false,
            allowedValues
        );

        uint256 deposit = platform.getRequestDeposit() + (LLM_COST_PER_AGENT * SUBCOMMITTEE_SIZE);
        requestId = platform.createRequest{value: deposit}(
            LLM_INFERENCE_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );
        pendingRequests[requestId] = true;

        emit InferenceRequested(requestId);
    }

    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) external {
        require(msg.sender == address(platform), "Only platform can call");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];

        if (status == ResponseStatus.Failed) {
            emit AgentFailed(requestId);
            return;
        }

        if (status == ResponseStatus.TimedOut) {
            emit AgentTimedOut(requestId);
            return;
        }

        if (status == ResponseStatus.Success && responses.length > 0) {
            latestResponse = abi.decode(responses[0].result, (string));
            emit InferenceReceived(requestId, latestResponse);
            return;
        }

        emit EmptyResponse(requestId);
    }

    receive() external payable {}
}
