// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AddressRegistry} from "../src/AddressRegistry.sol";
import {CompilerEngineV3} from "../src/CompilerEngineV3.sol";
import {GoalRegistry} from "../src/GoalRegistry.sol";
import {IntentStore} from "../src/IntentStore.sol";
import {ReceiptLog as ReceiptLogContract} from "../src/ReceiptLog.sol";
import {StandardOrderEncoder} from "../src/StandardOrderEncoder.sol";
import {ConsensusType, IAgentRequester, Request, Response, ResponseStatus} from "../src/interfaces/IAgentRequester.sol";

contract MockAgentRequesterV3 is IAgentRequester {
    uint256 public nextRequestId = 1;
    uint256 public lastAgentId;
    bytes4 public lastCallbackSelector;
    bytes public lastPayload;

    function createRequest(uint256 agentId, address, bytes4 callbackSelector, bytes calldata payload)
        external
        payable
        returns (uint256 requestId)
    {
        requestId = nextRequestId++;
        lastAgentId = agentId;
        lastCallbackSelector = callbackSelector;
        lastPayload = payload;
    }

    function createAdvancedRequest(uint256, address, bytes4, bytes calldata, uint256, uint256, ConsensusType, uint256)
        external
        payable
        returns (uint256 requestId)
    {
        requestId = nextRequestId++;
    }

    function getRequest(uint256) external pure returns (Request memory) {
        revert("not implemented");
    }

    function hasRequest(uint256) external pure returns (bool) {
        return false;
    }

    function getRequestDeposit() external pure returns (uint256) {
        return 0.03 ether;
    }

    function getAdvancedRequestDeposit(uint256) external pure returns (uint256) {
        return 0.03 ether;
    }
}

contract CompilerEngineV3Test is Test {
    struct CanonicalMandateOutput {
        bytes32 oracle;
        bytes32 settler;
        uint256 chainId;
        bytes32 token;
        uint256 amount;
        bytes32 recipient;
        bytes callbackData;
        bytes context;
    }

    struct CanonicalStandardOrder {
        address user;
        uint256 nonce;
        uint256 originChainId;
        uint32 expires;
        uint32 fillDeadline;
        address inputOracle;
        uint256[2][] inputs;
        CanonicalMandateOutput[] outputs;
    }

    function testV3StoresDecisionAndEncodesSelectedPool() external {
        (MockAgentRequesterV3 platform, CompilerEngineV3 compilerEngine, GoalRegistry goalRegistry, ReceiptLogContract receiptLog) =
            _deployHarness();

        string[] memory constraints = new string[](1);
        constraints[0] = "single-allocation";
        uint256 goalId = goalRegistry.postGoal{value: 0.6 ether}(
            "maximize USDC yield", address(0x1234), 100_000, 42161, constraints, block.timestamp + 1 days
        );

        _mockRatesCallback(platform, compilerEngine);
        string memory decision =
            '{"poolId":"compound-v3-usdc-base","objectiveMatched":"max_yield","rejectedAlternatives":[{"poolId":"aave-v3-usdc-base","reason":"lower APY"}],"reasoning":"Compound has higher APY while still verified."}';
        _mockDecisionCallback(platform, compilerEngine, decision);

        assertEq(uint256(goalRegistry.getGoal(goalId).status), uint256(GoalRegistry.GoalStatus.IntentReady));

        CanonicalStandardOrder memory order =
            abi.decode(compilerEngine.intentStore().getIntent(goalId), (CanonicalStandardOrder));
        assertEq(order.outputs.length, 1);
        assertEq(order.outputs[0].token, _addressToBytes32(address(0xC0)));
        assertEq(order.outputs[0].amount, 98_000);

        ReceiptLogContract.ReceiptEntry[] memory entries = receiptLog.getEntries(goalId);
        bool foundDecision;
        for (uint256 i = 0; i < entries.length; i++) {
            if (keccak256(bytes(entries[i].stepName)) == keccak256("decision_built")) {
                foundDecision = true;
                assertEq(abi.decode(entries[i].data, (string)), decision);
            }
        }
        assertTrue(foundDecision);
    }

    function testV3RejectsUnknownDecisionPool() external {
        (MockAgentRequesterV3 platform, CompilerEngineV3 compilerEngine, GoalRegistry goalRegistry,) = _deployHarness();

        string[] memory constraints = new string[](1);
        constraints[0] = "single-allocation";
        uint256 goalId = goalRegistry.postGoal{value: 0.6 ether}(
            "use the highest APY pool", address(0x1234), 100_000, 42161, constraints, block.timestamp + 1 days
        );

        _mockRatesCallback(platform, compilerEngine);
        _mockDecisionCallback(
            platform,
            compilerEngine,
            '{"poolId":"unverified-high-apy-pool","objectiveMatched":"max_yield","reasoning":"too spicy"}'
        );

        assertEq(uint256(goalRegistry.getGoal(goalId).status), uint256(GoalRegistry.GoalStatus.Failed));
        assertEq(compilerEngine.intentStore().getIntentHash(goalId), bytes32(0));
    }

    function _deployHarness()
        private
        returns (
            MockAgentRequesterV3 platform,
            CompilerEngineV3 compilerEngine,
            GoalRegistry goalRegistry,
            ReceiptLogContract receiptLog
        )
    {
        platform = new MockAgentRequesterV3();
        AddressRegistry addressRegistry = new AddressRegistry(address(this));
        addressRegistry.setInputSettler(42161, address(0x1001));
        addressRegistry.setVenue(
            "base",
            "aave-v3-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: address(0xA0),
                positionToken: address(0),
                outputSettler: address(0x3001),
                oracle: address(0x4001),
                receiver: address(0),
                chainId: 8453,
                strategyId: bytes32(0),
                outputBps: 98_00,
                active: true
            })
        );
        addressRegistry.setVenue(
            "base",
            "compound-v3-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: address(0xC0),
                positionToken: address(0),
                outputSettler: address(0x3001),
                oracle: address(0x4001),
                receiver: address(0),
                chainId: 8453,
                strategyId: bytes32(0),
                outputBps: 98_00,
                active: true
            })
        );

        StandardOrderEncoder encoder = new StandardOrderEncoder(address(addressRegistry));
        receiptLog = new ReceiptLogContract(address(this), address(0));
        IntentStore intentStore = new IntentStore(address(this), address(0));
        goalRegistry = new GoalRegistry(address(this), address(0));
        compilerEngine = new CompilerEngineV3(
            address(platform),
            address(goalRegistry),
            address(receiptLog),
            address(intentStore),
            address(encoder),
            "https://example.com/api/yields",
            "payload"
        );

        receiptLog.setCompilerEngine(address(compilerEngine));
        intentStore.setCompilerEngine(address(compilerEngine));
        goalRegistry.setCompilerEngine(address(compilerEngine));
    }

    function _mockRatesCallback(MockAgentRequesterV3 platform, CompilerEngineV3 compilerEngine) private {
        Response[] memory responses = new Response[](1);
        responses[0].result = abi.encode(
            "poolId=aave-v3-usdc-base,apy=3.1,riskTier=lowest|poolId=compound-v3-usdc-base,apy=3.2,riskTier=low"
        );

        vm.prank(address(platform));
        compilerEngine.handleRatesResponse(1, responses, ResponseStatus.Success, _emptyRequest());
    }

    function _mockDecisionCallback(
        MockAgentRequesterV3 platform,
        CompilerEngineV3 compilerEngine,
        string memory decision
    ) private {
        Response[] memory responses = new Response[](1);
        responses[0].result = abi.encode(decision);

        vm.prank(address(platform));
        compilerEngine.handleDecisionResponse(2, responses, ResponseStatus.Success, _emptyRequest());
    }

    function _emptyRequest() private pure returns (Request memory request) {}

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }
}
