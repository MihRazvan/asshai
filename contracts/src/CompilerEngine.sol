// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRequester, Request, Response, ResponseStatus} from "./interfaces/IAgentRequester.sol";
import {IJsonApiAgent} from "./interfaces/IJsonApiAgent.sol";
import {ILlmInferenceAgent} from "./interfaces/ILlmInferenceAgent.sol";
import {GoalRegistry} from "./GoalRegistry.sol";
import {IntentStore} from "./IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "./ReceiptLog.sol";
import {SomniaConfig} from "./SomniaConfig.sol";
import {StandardOrderEncoder} from "./StandardOrderEncoder.sol";

contract CompilerEngine {
    enum CompileStep {
        Idle,
        FetchingRates,
        FilteringPools,
        BuildingPlan,
        EncodingOrder,
        Done,
        Failed
    }

    struct CompileState {
        uint256 goalId;
        CompileStep step;
        uint256 currentAgentRequestId;
        bytes ratesPayload;
        string[] candidatePoolIds;
        bytes allocationPlan;
    }

    IAgentRequester public platform;
    GoalRegistry public goalRegistry;
    ReceiptLogContract public receiptLog;
    IntentStore public intentStore;
    StandardOrderEncoder public standardOrderEncoder;
    address public owner;
    string public ratesUrl;
    string public ratesSelector;

    mapping(uint256 => CompileState) public compileStates;
    mapping(uint256 => bool) public pendingRequests;
    mapping(uint256 => uint256) public requestToGoal;

    event CompileStarted(uint256 indexed goalId);
    event CompileFailed(uint256 indexed goalId, uint256 indexed requestId, ResponseStatus status);
    event RatesSourceSet(string url, string selector);
    event RatesRequestCreated(uint256 indexed goalId, uint256 indexed requestId);
    event RatesFetched(uint256 indexed goalId, uint256 indexed requestId, bytes payload);
    event FilterRequestCreated(uint256 indexed goalId, uint256 indexed requestId);
    event CandidatesSelected(uint256 indexed goalId, uint256 indexed requestId, string candidates);
    event PlanRequestCreated(uint256 indexed goalId, uint256 indexed requestId);
    event PlanBuilt(uint256 indexed goalId, uint256 indexed requestId, string allocationPlan);
    event IntentReady(uint256 indexed goalId, bytes32 indexed intentHash);

    modifier onlyGoalRegistry() {
        require(msg.sender == address(goalRegistry), "Only registry");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(
        address platformAddress,
        address goalRegistryAddress,
        address receiptLogAddress,
        address intentStoreAddress,
        address standardOrderEncoderAddress,
        string memory initialRatesUrl,
        string memory initialRatesSelector
    ) {
        require(platformAddress != address(0), "Zero platform");
        owner = msg.sender;
        platform = IAgentRequester(platformAddress);
        goalRegistry = GoalRegistry(payable(goalRegistryAddress));
        receiptLog = ReceiptLogContract(receiptLogAddress);
        intentStore = IntentStore(intentStoreAddress);
        standardOrderEncoder = StandardOrderEncoder(standardOrderEncoderAddress);
        ratesUrl = initialRatesUrl;
        ratesSelector = initialRatesSelector;
        emit RatesSourceSet(initialRatesUrl, initialRatesSelector);
    }

    function setRatesSource(string calldata newRatesUrl, string calldata newRatesSelector) external onlyOwner {
        require(bytes(newRatesUrl).length > 0, "Empty URL");
        require(bytes(newRatesSelector).length > 0, "Empty selector");
        ratesUrl = newRatesUrl;
        ratesSelector = newRatesSelector;
        emit RatesSourceSet(newRatesUrl, newRatesSelector);
    }

    function startCompile(uint256 goalId) external payable onlyGoalRegistry {
        require(bytes(ratesUrl).length > 0, "Missing rates URL");
        require(bytes(ratesSelector).length > 0, "Missing rates selector");

        CompileState storage state = compileStates[goalId];
        state.goalId = goalId;
        state.step = CompileStep.FetchingRates;

        bytes memory payload = abi.encodeWithSelector(IJsonApiAgent.fetchString.selector, ratesUrl, ratesSelector);
        uint256 deposit = _jsonRequestDeposit();
        require(msg.value >= deposit, "Insufficient compile fee");

        uint256 requestId = platform.createRequest{value: deposit}(
            SomniaConfig.JSON_API_AGENT_ID, address(this), this.handleRatesResponse.selector, payload
        );

        state.currentAgentRequestId = requestId;
        pendingRequests[requestId] = true;
        requestToGoal[requestId] = goalId;

        emit CompileStarted(goalId);
        emit RatesRequestCreated(goalId, requestId);
    }

    function handleRatesResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handleRatesCallback(requestId, responses, status, details);
    }

    function handleFilterResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handleFilterCallback(requestId, responses, status, details);
    }

    function handlePlanResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external {
        _handlePlanCallback(requestId, responses, status, details);
    }

    function _handleRatesCallback(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    )
        private
    {
        require(msg.sender == address(platform), "Only platform can call");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];
        uint256 goalId = requestToGoal[requestId];
        delete requestToGoal[requestId];

        if (status == ResponseStatus.Failed || status == ResponseStatus.TimedOut) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        if (status != ResponseStatus.Success || responses.length == 0) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        bytes memory ratesPayload = abi.encode(abi.decode(responses[0].result, (string)));
        CompileState storage state = compileStates[goalId];
        state.ratesPayload = ratesPayload;
        state.step = CompileStep.FilteringPools;

        receiptLog.log(goalId, "rates_fetched", ratesPayload, requestId);
        emit RatesFetched(goalId, requestId, ratesPayload);

        _requestPoolFilter(goalId, abi.decode(ratesPayload, (string)));
    }

    function _requestPoolFilter(uint256 goalId, string memory compactPoolData) private {
        GoalRegistry.Goal memory goal = goalRegistry.getGoal(goalId);
        string memory prompt = string.concat(
            "You are a DeFi yield router. Given the user's goal and constraints, select ",
            "the top 3 pools from the candidates that best fit the goal. Return ONLY pool ",
            "IDs, comma-separated, no other text.\n\nGoal: \"",
            goal.naturalLanguage,
            "\"\nConstraints: ",
            _joinConstraints(goal.constraints),
            "\n\nCandidates:\n",
            compactPoolData,
            "\n\nSelection:"
        );

        string[] memory allowedValues = new string[](0);
        bytes memory payload = abi.encodeWithSelector(
            ILlmInferenceAgent.inferString.selector,
            prompt,
            "You select candidate pool IDs for a stablecoin yield intent compiler.",
            false,
            allowedValues
        );
        uint256 deposit = _llmRequestDeposit();
        require(address(this).balance >= deposit, "Insufficient LLM fee");

        uint256 filterRequestId = platform.createRequest{value: deposit}(
            SomniaConfig.LLM_INFERENCE_AGENT_ID, address(this), this.handleFilterResponse.selector, payload
        );

        CompileState storage state = compileStates[goalId];
        state.currentAgentRequestId = filterRequestId;
        pendingRequests[filterRequestId] = true;
        requestToGoal[filterRequestId] = goalId;

        emit FilterRequestCreated(goalId, filterRequestId);
    }

    function _handleFilterCallback(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) private {
        require(msg.sender == address(platform), "Only platform can call");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];
        uint256 goalId = requestToGoal[requestId];
        delete requestToGoal[requestId];

        if (status == ResponseStatus.Failed || status == ResponseStatus.TimedOut) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        if (status != ResponseStatus.Success || responses.length == 0) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        string memory candidates = abi.decode(responses[0].result, (string));
        CompileState storage state = compileStates[goalId];
        state.candidatePoolIds = _splitCsv(candidates);
        state.step = CompileStep.BuildingPlan;

        receiptLog.log(goalId, "candidates_selected", abi.encode(candidates), requestId);
        emit CandidatesSelected(goalId, requestId, candidates);

        _requestAllocationPlan(goalId, candidates);
    }

    function _requestAllocationPlan(uint256 goalId, string memory candidates) private {
        GoalRegistry.Goal memory goal = goalRegistry.getGoal(goalId);
        string memory poolData = abi.decode(compileStates[goalId].ratesPayload, (string));
        string memory prompt = string.concat(
            "Build an allocation plan. Output ONLY a JSON object in this exact schema:\n",
            "{\"allocations\":[{\"chainName\":\"<name>\",\"poolId\":\"<id>\",\"pct\":<0-100>}],",
            "\"reasoning\":\"<short>\"}\n",
            "Use lowercase chainName values only. Percentages must sum to exactly 100. ",
            "No markdown. No text before or after the JSON.\n\n",
            "Goal: \"",
            goal.naturalLanguage,
            "\"\nSource: ",
            _uintToString(goal.sourceAmount),
            " units on chain ",
            _uintToString(goal.sourceChainId),
            "\nSelected pool IDs to allocate across (you must use all):\n",
            candidates,
            "\n\nCandidate pool data with canonical lowercase chain names:\n",
            poolData
        );

        string[] memory allowedValues = new string[](0);
        bytes memory payload = abi.encodeWithSelector(
            ILlmInferenceAgent.inferString.selector,
            prompt,
            "You build strict JSON allocation plans for a stablecoin yield intent compiler.",
            false,
            allowedValues
        );
        uint256 deposit = _llmRequestDeposit();
        require(address(this).balance >= deposit, "Insufficient plan fee");

        uint256 planRequestId = platform.createRequest{value: deposit}(
            SomniaConfig.LLM_INFERENCE_AGENT_ID, address(this), this.handlePlanResponse.selector, payload
        );

        CompileState storage state = compileStates[goalId];
        state.currentAgentRequestId = planRequestId;
        pendingRequests[planRequestId] = true;
        requestToGoal[planRequestId] = goalId;

        emit PlanRequestCreated(goalId, planRequestId);
    }

    function _handlePlanCallback(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    )
        private
    {
        require(msg.sender == address(platform), "Only platform can call");
        require(pendingRequests[requestId], "Unknown request");

        delete pendingRequests[requestId];
        uint256 goalId = requestToGoal[requestId];
        delete requestToGoal[requestId];

        if (status == ResponseStatus.Failed || status == ResponseStatus.TimedOut) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        if (status != ResponseStatus.Success || responses.length == 0) {
            compileStates[goalId].step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, status);
            return;
        }

        string memory plan = abi.decode(responses[0].result, (string));
        CompileState storage state = compileStates[goalId];
        state.allocationPlan = abi.encode(plan);
        state.step = CompileStep.EncodingOrder;

        receiptLog.log(goalId, "plan_built", abi.encode(plan), requestId);
        emit PlanBuilt(goalId, requestId, plan);

        (bool parsed, StandardOrderEncoder.Allocation[] memory allocations) = _parseAllocationPlan(plan);
        if (!parsed || !_allocationsUseCandidates(goalId, allocations)) {
            state.currentAgentRequestId = 0;
            state.step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, ResponseStatus.Failed);
            return;
        }

        GoalRegistry.Goal memory goal = goalRegistry.getGoal(goalId);
        try standardOrderEncoder.encode(
            goal.author, goal.sourceChainId, goal.sourceAsset, goal.sourceAmount, allocations
        ) returns (
            bytes memory encodedIntent
        ) {
            intentStore.store(goalId, encodedIntent);
            bytes32 intentHash = intentStore.getIntentHash(goalId);

            state.currentAgentRequestId = 0;
            state.step = CompileStep.Done;

            receiptLog.log(goalId, "order_encoded", encodedIntent, 0);
            goalRegistry.markIntentReady(goalId, intentHash);
            emit IntentReady(goalId, intentHash);
        } catch {
            state.currentAgentRequestId = 0;
            state.step = CompileStep.Failed;
            goalRegistry.markFailed(goalId);
            emit CompileFailed(goalId, requestId, ResponseStatus.Failed);
        }
    }

    function _jsonRequestDeposit() private view returns (uint256) {
        return
            platform.getRequestDeposit()
                + (SomniaConfig.JSON_API_COST_PER_AGENT * SomniaConfig.DEFAULT_SUBCOMMITTEE_SIZE);
    }

    function _llmRequestDeposit() private view returns (uint256) {
        return platform.getRequestDeposit()
            + (SomniaConfig.LLM_INFERENCE_COST_PER_AGENT * SomniaConfig.DEFAULT_SUBCOMMITTEE_SIZE);
    }

    function _joinConstraints(string[] memory constraints) private pure returns (string memory joined) {
        if (constraints.length == 0) {
            return "none";
        }

        joined = constraints[0];
        for (uint256 i = 1; i < constraints.length; i++) {
            joined = string.concat(joined, ", ", constraints[i]);
        }
    }

    function _splitCsv(string memory csv) private pure returns (string[] memory values) {
        bytes memory data = bytes(csv);
        if (data.length == 0) {
            return new string[](0);
        }

        uint256 count = 1;
        for (uint256 i = 0; i < data.length; i++) {
            if (data[i] == 0x2c) {
                count++;
            }
        }

        values = new string[](count);
        uint256 start;
        uint256 index;
        for (uint256 i = 0; i <= data.length; i++) {
            if (i == data.length || data[i] == 0x2c) {
                values[index++] = _trim(bytes(_slice(data, start, i)));
                start = i + 1;
            }
        }
    }

    function _parseAllocationPlan(string memory plan)
        private
        pure
        returns (bool ok, StandardOrderEncoder.Allocation[] memory allocations)
    {
        bytes memory data = bytes(plan);
        bytes memory chainKey = bytes("\"chainName\"");

        uint256 count = _countOccurrences(data, chainKey);
        if (count == 0 || count > 3) {
            return (false, allocations);
        }

        allocations = new StandardOrderEncoder.Allocation[](count);
        uint256 cursor;
        uint256 totalBps;

        for (uint256 i = 0; i < count; i++) {
            (ok, allocations[i], cursor) = _parseAllocationAt(data, cursor);
            if (!ok) {
                return (false, allocations);
            }
            totalBps += allocations[i].bps;
        }

        return (totalBps == 10_000, allocations);
    }

    function _parseAllocationAt(bytes memory data, uint256 cursor)
        private
        pure
        returns (bool ok, StandardOrderEncoder.Allocation memory allocation, uint256 nextCursor)
    {
        bytes memory chainKey = bytes("\"chainName\"");
        bytes memory poolKey = bytes("\"poolId\"");
        bytes memory pctKey = bytes("\"pct\"");

        bool found;
        string memory chainName;
        string memory poolId;
        uint256 pct;

        (found, cursor) = _find(data, chainKey, cursor);
        if (!found) {
            return (false, allocation, cursor);
        }
        (ok, chainName, cursor) = _readJsonStringValue(data, cursor + chainKey.length);
        if (!ok) {
            return (false, allocation, cursor);
        }

        (found, cursor) = _find(data, poolKey, cursor);
        if (!found) {
            return (false, allocation, cursor);
        }
        (ok, poolId, cursor) = _readJsonStringValue(data, cursor + poolKey.length);
        if (!ok) {
            return (false, allocation, cursor);
        }

        (found, cursor) = _find(data, pctKey, cursor);
        if (!found) {
            return (false, allocation, cursor);
        }
        (ok, pct, cursor) = _readJsonUintValue(data, cursor + pctKey.length);
        if (!ok || pct > 100) {
            return (false, allocation, cursor);
        }

        allocation =
            StandardOrderEncoder.Allocation({chainName: _toLowerAscii(chainName), poolId: poolId, bps: uint16(pct * 100)});
        return (true, allocation, cursor);
    }

    function _allocationsUseCandidates(uint256 goalId, StandardOrderEncoder.Allocation[] memory allocations)
        private
        view
        returns (bool)
    {
        string[] storage candidates = compileStates[goalId].candidatePoolIds;
        if (allocations.length == 0 || candidates.length == 0) {
            return false;
        }

        for (uint256 i = 0; i < allocations.length; i++) {
            bool matched;
            for (uint256 j = 0; j < candidates.length; j++) {
                if (_stringEq(allocations[i].poolId, candidates[j])) {
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                return false;
            }
        }

        return true;
    }

    function _countOccurrences(bytes memory data, bytes memory needle) private pure returns (uint256 count) {
        uint256 cursor;
        bool found = true;
        while (found) {
            (found, cursor) = _find(data, needle, cursor);
            if (found) {
                count++;
                cursor += needle.length;
            }
        }
    }

    function _find(bytes memory data, bytes memory needle, uint256 start)
        private
        pure
        returns (bool found, uint256 index)
    {
        if (needle.length == 0 || data.length < needle.length || start > data.length - needle.length) {
            return (false, 0);
        }

        for (uint256 i = start; i <= data.length - needle.length; i++) {
            bool matched = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (data[i + j] != needle[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                return (true, i);
            }
        }
    }

    function _readJsonStringValue(bytes memory data, uint256 cursor)
        private
        pure
        returns (bool ok, string memory value, uint256 nextCursor)
    {
        while (cursor < data.length && data[cursor] != 0x3a) {
            cursor++;
        }
        if (cursor == data.length) {
            return (false, value, cursor);
        }

        cursor++;
        while (cursor < data.length && _isWhitespace(data[cursor])) {
            cursor++;
        }
        if (cursor == data.length || data[cursor] != 0x22) {
            return (false, value, cursor);
        }

        uint256 start = ++cursor;
        while (cursor < data.length && data[cursor] != 0x22) {
            cursor++;
        }
        if (cursor == data.length) {
            return (false, value, cursor);
        }

        return (true, _slice(data, start, cursor), cursor + 1);
    }

    function _readJsonUintValue(bytes memory data, uint256 cursor)
        private
        pure
        returns (bool ok, uint256 value, uint256 nextCursor)
    {
        while (cursor < data.length && data[cursor] != 0x3a) {
            cursor++;
        }
        if (cursor == data.length) {
            return (false, 0, cursor);
        }

        cursor++;
        while (cursor < data.length && _isWhitespace(data[cursor])) {
            cursor++;
        }

        uint256 start = cursor;
        while (cursor < data.length && data[cursor] >= 0x30 && data[cursor] <= 0x39) {
            value = (value * 10) + (uint8(data[cursor]) - 48);
            cursor++;
        }

        return (cursor > start, value, cursor);
    }

    function _isWhitespace(bytes1 char) private pure returns (bool) {
        return char == 0x20 || char == 0x0a || char == 0x0d || char == 0x09;
    }

    function _toLowerAscii(string memory value) private pure returns (string memory) {
        bytes memory data = bytes(value);
        for (uint256 i = 0; i < data.length; i++) {
            if (data[i] >= 0x41 && data[i] <= 0x5a) {
                data[i] = bytes1(uint8(data[i]) + 32);
            }
        }
        return string(data);
    }

    function _stringEq(string memory left, string memory right) private pure returns (bool) {
        return keccak256(bytes(left)) == keccak256(bytes(right));
    }

    function _slice(bytes memory data, uint256 start, uint256 end) private pure returns (string memory) {
        bytes memory out = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = data[i];
        }
        return string(out);
    }

    function _trim(bytes memory data) private pure returns (string memory) {
        uint256 start;
        uint256 end = data.length;

        while (start < end && data[start] == 0x20) {
            start++;
        }
        while (end > start && data[end - 1] == 0x20) {
            end--;
        }

        return _slice(data, start, end);
    }

    function _uintToString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

    receive() external payable {}
}
