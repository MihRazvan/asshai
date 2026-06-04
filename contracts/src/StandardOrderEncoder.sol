// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AddressRegistry} from "./AddressRegistry.sol";

contract StandardOrderEncoder {
    struct Allocation {
        string chainName;
        string poolId;
        uint16 bps;
    }

    struct MandateOutput {
        bytes32 oracle;
        bytes32 settler;
        uint256 chainId;
        bytes32 token;
        uint256 amount;
        bytes32 recipient;
        bytes callbackData;
        bytes context;
    }

    struct StandardOrder {
        address user;
        uint256 nonce;
        uint256 originChainId;
        uint32 expires;
        uint32 fillDeadline;
        address inputOracle;
        uint256[2][] inputs;
        MandateOutput[] outputs;
    }

    struct YieldAction {
        uint256 goalId;
        address beneficiary;
        address deliveryToken;
        address positionToken;
        bytes32 strategyId;
        uint256 minAmount;
    }

    AddressRegistry public immutable registry;

    constructor(address registryAddress) {
        require(registryAddress != address(0), "Zero registry");
        registry = AddressRegistry(registryAddress);
    }

    function encode(
        uint256 goalId,
        address user,
        uint256 sourceChainId,
        address sourceAsset,
        uint256 sourceAmount,
        Allocation[] calldata allocs
    ) external view returns (bytes memory standardOrderEncoded) {
        require(user != address(0), "Zero user");
        require(sourceAsset != address(0), "Zero source asset");
        require(sourceAmount > 0, "Zero amount");
        require(allocs.length > 0, "No allocations");
        require(registry.getInputSettler(sourceChainId) != address(0), "Missing input settler");

        uint256 totalBps;
        uint256 allocatedAmount;
        MandateOutput[] memory outputs = new MandateOutput[](allocs.length);
        address inputOracle;

        for (uint256 i = 0; i < allocs.length; i++) {
            AddressRegistry.VenueConfig memory venue =
                registry.getVenue(allocs[i].chainName, allocs[i].poolId);
            require(venue.active, "Inactive venue");

            totalBps += allocs[i].bps;
            uint256 inputAmount = i == allocs.length - 1
                ? sourceAmount - allocatedAmount
                : (sourceAmount * allocs[i].bps) / 10_000;
            allocatedAmount += inputAmount;

            if (inputOracle == address(0)) {
                inputOracle = venue.oracle;
            } else {
                require(inputOracle == venue.oracle, "Mixed oracle systems");
            }

            outputs[i] = _buildOutput(goalId, user, inputAmount, venue);
        }

        require(totalBps == 10_000, "Invalid bps");

        uint256[2][] memory inputs = new uint256[2][](1);
        inputs[0] = [uint256(uint160(sourceAsset)), sourceAmount];

        StandardOrder memory order = StandardOrder({
            user: user,
            nonce: uint256(keccak256(abi.encode(goalId, user, sourceChainId, sourceAsset, sourceAmount, allocs, block.timestamp))),
            originChainId: sourceChainId,
            expires: uint32(block.timestamp + 2 hours),
            fillDeadline: uint32(block.timestamp + 30 minutes),
            inputOracle: inputOracle,
            inputs: inputs,
            outputs: outputs
        });

        return abi.encode(order);
    }

    function _addressToBytes32(address value) private pure returns (bytes32) {
        return bytes32(uint256(uint160(value)));
    }

    function _buildOutput(
        uint256 goalId,
        address user,
        uint256 inputAmount,
        AddressRegistry.VenueConfig memory venue
    ) private pure returns (MandateOutput memory output) {
        require(venue.deliveryToken != address(0), "Missing delivery token");
        require(venue.outputSettler != address(0), "Missing output settler");
        require(venue.oracle != address(0), "Missing oracle");
        require(venue.outputBps <= 10_000, "Invalid output bps");

        uint256 outputAmount = (inputAmount * _outputBpsOrDefault(venue.outputBps)) / 10_000;
        require(outputAmount > 0, "Zero output amount");

        bytes memory callbackData;
        bytes32 recipient = _addressToBytes32(user);
        if (venue.receiver != address(0)) {
            require(venue.strategyId != bytes32(0), "Missing strategy");
            require(venue.positionToken != address(0), "Missing position token");
            callbackData = abi.encode(
                YieldAction({
                    goalId: goalId,
                    beneficiary: user,
                    deliveryToken: venue.deliveryToken,
                    positionToken: venue.positionToken,
                    strategyId: venue.strategyId,
                    minAmount: outputAmount
                })
            );
            recipient = _addressToBytes32(venue.receiver);
        }

        output = MandateOutput({
            oracle: _addressToBytes32(venue.oracle),
            settler: _addressToBytes32(venue.outputSettler),
            chainId: venue.chainId,
            token: _addressToBytes32(venue.deliveryToken),
            amount: outputAmount,
            recipient: recipient,
            callbackData: callbackData,
            context: ""
        });
    }

    function _outputBpsOrDefault(uint16 outputBps) private pure returns (uint16) {
        return outputBps == 0 ? 10_000 : outputBps;
    }
}
