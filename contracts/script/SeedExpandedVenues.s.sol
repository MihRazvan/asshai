// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AddressRegistry} from "../src/AddressRegistry.sol";

contract SeedExpandedVenues is Script {
    address internal constant OUTPUT_SETTLER = 0x0000000000eC36B683C2E6AC89e9A75989C22a2e;
    address internal constant POLYMER_ORACLE_MAINNET = 0x0000003E06000007A224AeE90052fA6bb46d43C9;

    address internal constant BASE_SPARK_USDC_VAULT = 0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A;
    address internal constant BASE_MOONWELL_FLAGSHIP_USDC_VAULT = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca;
    address internal constant BASE_FLUID_USDC = 0xf42f5795D9ac7e9D757dB633D693cD548Cfd9169;
    address internal constant BASE_STEAKHOUSE_PRIME_USDC = 0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9;

    uint256 internal constant BASE_CHAIN_ID = 8453;
    uint16 internal constant DIRECT_COMPOSER_OUTPUT_BPS = 9_800;

    function run() external {
        AddressRegistry registry = AddressRegistry(vm.envAddress("ADDRESS_REGISTRY_ADDRESS"));

        vm.startBroadcast();

        _seed(registry, "morpho-spark-usdc-base", BASE_SPARK_USDC_VAULT);
        _seed(registry, "morpho-moonwell-flagship-usdc-base", BASE_MOONWELL_FLAGSHIP_USDC_VAULT);
        _seed(registry, "fluid-usdc-base", BASE_FLUID_USDC);
        _seed(registry, "steakhouse-prime-usdc-base", BASE_STEAKHOUSE_PRIME_USDC);

        vm.stopBroadcast();
    }

    function _seed(AddressRegistry registry, string memory poolId, address deliveryToken) private {
        registry.setVenue(
            "base",
            poolId,
            AddressRegistry.VenueConfig({
                deliveryToken: deliveryToken,
                positionToken: address(0),
                outputSettler: OUTPUT_SETTLER,
                oracle: POLYMER_ORACLE_MAINNET,
                receiver: address(0),
                chainId: BASE_CHAIN_ID,
                strategyId: bytes32(0),
                outputBps: DIRECT_COMPOSER_OUTPUT_BPS,
                active: true
            })
        );
    }
}
