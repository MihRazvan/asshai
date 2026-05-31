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
        address oracle;
        address settler;
        uint256 chainId;
        address token;
        uint256 amount;
        address recipient;
        bytes call;
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

    AddressRegistry public immutable registry;

    constructor(address registryAddress) {
        require(registryAddress != address(0), "Zero registry");
        registry = AddressRegistry(registryAddress);
    }

    function encode(
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
            require(venue.vaultToken != address(0), "Missing vault token");
            require(venue.outputSettler != address(0), "Missing output settler");
            require(venue.oracle != address(0), "Missing oracle");

            totalBps += allocs[i].bps;
            uint256 amount = i == allocs.length - 1
                ? sourceAmount - allocatedAmount
                : (sourceAmount * allocs[i].bps) / 10_000;
            allocatedAmount += amount;

            if (inputOracle == address(0)) {
                inputOracle = venue.oracle;
            } else {
                require(inputOracle == venue.oracle, "Mixed oracle systems");
            }

            outputs[i] = MandateOutput({
                oracle: venue.oracle,
                settler: venue.outputSettler,
                chainId: venue.chainId,
                token: venue.vaultToken,
                amount: amount,
                recipient: user,
                call: "",
                context: ""
            });
        }

        require(totalBps == 10_000, "Invalid bps");

        uint256[2][] memory inputs = new uint256[2][](1);
        inputs[0] = [uint256(uint160(sourceAsset)), sourceAmount];

        StandardOrder memory order = StandardOrder({
            user: user,
            nonce: uint256(keccak256(abi.encode(user, sourceChainId, sourceAsset, block.timestamp))),
            originChainId: sourceChainId,
            expires: uint32(block.timestamp + 2 hours),
            fillDeadline: uint32(block.timestamp + 30 minutes),
            inputOracle: inputOracle,
            inputs: inputs,
            outputs: outputs
        });

        return abi.encode(order);
    }
}
