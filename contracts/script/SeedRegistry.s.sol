// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AddressRegistry} from "../src/AddressRegistry.sol";

contract SeedRegistry is Script {
    address internal constant INPUT_SETTLER_ESCROW = 0x000025c3226C00B2Cdc200005a1600509f4e00C0;
    address internal constant OUTPUT_SETTLER = 0x0000000000eC36B683C2E6AC89e9A75989C22a2e;
    address internal constant POLYMER_ORACLE_MAINNET = 0x0000003E06000007A224AeE90052fA6bb46d43C9;

    address internal constant ETHEREUM_USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant ARBITRUM_USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    address internal constant ETHEREUM_AUSDC = 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c;
    address internal constant BASE_AUSDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;
    address internal constant BASE_COMPOUND_CUSDCV3 = 0xb125E6687d4313864e53df431d5425969c15Eb2F;
    address internal constant BASE_SPARK_USDC_VAULT = 0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A;
    address internal constant BASE_MOONWELL_FLAGSHIP_USDC_VAULT = 0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca;
    address internal constant BASE_FLUID_USDC = 0xf42f5795D9ac7e9D757dB633D693cD548Cfd9169;
    address internal constant BASE_STEAKHOUSE_PRIME_USDC = 0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9;
    address internal constant ARBITRUM_AUSDC = 0x724dc807b04555b71ed48a6896b6F41593b8C637;
    bytes32 internal constant AAVE_V3_USDC_BASE_SUPPLY = keccak256("aave-v3-usdc-base:supply");
    uint16 internal constant CALLBACK_OUTPUT_BPS = 9_800;
    uint16 internal constant DIRECT_COMPOSER_OUTPUT_BPS = 9_800;

    uint256 internal constant ETHEREUM_CHAIN_ID = 1;
    uint256 internal constant BASE_CHAIN_ID = 8453;
    uint256 internal constant ARBITRUM_CHAIN_ID = 42161;

    function run() external {
        AddressRegistry registry = AddressRegistry(vm.envAddress("ADDRESS_REGISTRY_ADDRESS"));
        address baseYieldReceiver = vm.envOr("BASE_YIELD_RECEIVER_ADDRESS", address(0));

        vm.startBroadcast();

        registry.setInputSettler(ETHEREUM_CHAIN_ID, INPUT_SETTLER_ESCROW);
        registry.setInputSettler(BASE_CHAIN_ID, INPUT_SETTLER_ESCROW);
        registry.setInputSettler(ARBITRUM_CHAIN_ID, INPUT_SETTLER_ESCROW);

        registry.setToken("ethereum", "USDC", ETHEREUM_USDC);
        registry.setToken("base", "USDC", BASE_USDC);
        registry.setToken("arbitrum", "USDC", ARBITRUM_USDC);

        registry.setVenue(
            "ethereum",
            "aave-v3-usdc-mainnet",
            AddressRegistry.VenueConfig({
                deliveryToken: ETHEREUM_AUSDC,
                positionToken: address(0),
                outputSettler: OUTPUT_SETTLER,
                oracle: POLYMER_ORACLE_MAINNET,
                receiver: address(0),
                chainId: ETHEREUM_CHAIN_ID,
                strategyId: bytes32(0),
                outputBps: 0,
                active: true
            })
        );
        registry.setVenue(
            "base",
            "aave-v3-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: BASE_USDC,
                positionToken: BASE_AUSDC,
                outputSettler: OUTPUT_SETTLER,
                oracle: POLYMER_ORACLE_MAINNET,
                receiver: baseYieldReceiver,
                chainId: BASE_CHAIN_ID,
                strategyId: baseYieldReceiver == address(0) ? bytes32(0) : AAVE_V3_USDC_BASE_SUPPLY,
                outputBps: baseYieldReceiver == address(0) ? 0 : CALLBACK_OUTPUT_BPS,
                active: true
            })
        );
        registry.setVenue(
            "base",
            "compound-v3-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: BASE_COMPOUND_CUSDCV3,
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
        registry.setVenue(
            "base",
            "morpho-spark-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: BASE_SPARK_USDC_VAULT,
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
        registry.setVenue(
            "base",
            "morpho-moonwell-flagship-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: BASE_MOONWELL_FLAGSHIP_USDC_VAULT,
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
        registry.setVenue(
            "base",
            "fluid-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: BASE_FLUID_USDC,
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
        registry.setVenue(
            "base",
            "steakhouse-prime-usdc-base",
            AddressRegistry.VenueConfig({
                deliveryToken: BASE_STEAKHOUSE_PRIME_USDC,
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
        registry.setVenue(
            "arbitrum",
            "aave-v3-usdc-arb",
            AddressRegistry.VenueConfig({
                deliveryToken: ARBITRUM_AUSDC,
                positionToken: address(0),
                outputSettler: OUTPUT_SETTLER,
                oracle: POLYMER_ORACLE_MAINNET,
                receiver: address(0),
                chainId: ARBITRUM_CHAIN_ID,
                strategyId: bytes32(0),
                outputBps: 0,
                active: true
            })
        );

        vm.stopBroadcast();
    }
}
