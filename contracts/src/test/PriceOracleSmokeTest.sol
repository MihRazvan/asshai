// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "../interfaces/IAgentRequester.sol";
import {IJsonApiAgent} from "../interfaces/IJsonApiAgent.sol";
import {SomniaConfig} from "../SomniaConfig.sol";

contract PriceOracleSmokeTest {
    IAgentRequester public platform =
        IAgentRequester(SomniaConfig.TESTNET_PLATFORM);

    uint256 public constant JSON_API_AGENT_ID = SomniaConfig.JSON_API_AGENT_ID;
    uint256 public constant SUBCOMMITTEE_SIZE = SomniaConfig.DEFAULT_SUBCOMMITTEE_SIZE;
    uint256 public constant JSON_FETCH_COST_PER_AGENT = SomniaConfig.JSON_API_COST_PER_AGENT;

    uint256 public latestPrice;
    mapping(uint256 => bool) public pendingRequests;

    event PriceRequested(uint256 indexed requestId);
    event PriceReceived(uint256 indexed requestId, uint256 price);
    event AgentFailed(uint256 indexed requestId);
    event AgentTimedOut(uint256 indexed requestId);
    event EmptyResponse(uint256 indexed requestId);

    function requestBitcoinPrice() external payable returns (uint256 requestId) {
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector,
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
            "bitcoin.usd",
            uint8(8)
        );

        uint256 reserve = platform.getRequestDeposit();
        uint256 reward = JSON_FETCH_COST_PER_AGENT * SUBCOMMITTEE_SIZE;
        uint256 deposit = reserve + reward;
        requestId = platform.createRequest{value: deposit}(
            JSON_API_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );
        pendingRequests[requestId] = true;

        emit PriceRequested(requestId);
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
            latestPrice = abi.decode(responses[0].result, (uint256));
            emit PriceReceived(requestId, latestPrice);
            return;
        }

        emit EmptyResponse(requestId);
    }

    receive() external payable {}
}

