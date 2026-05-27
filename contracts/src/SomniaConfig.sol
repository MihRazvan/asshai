// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library SomniaConfig {
    uint256 internal constant TESTNET_CHAIN_ID = 50312;
    uint256 internal constant MAINNET_CHAIN_ID = 5031;

    address internal constant TESTNET_PLATFORM =
        0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
    address internal constant MAINNET_PLATFORM =
        0x5E5205CF39E766118C01636bED000A54D93163E6;

    uint256 internal constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 internal constant LLM_INFERENCE_AGENT_ID = 12847293847561029384;
    uint256 internal constant DEFAULT_SUBCOMMITTEE_SIZE = 3;

    uint256 internal constant JSON_API_COST_PER_AGENT = 0.03 ether;
    uint256 internal constant LLM_INFERENCE_COST_PER_AGENT = 0.07 ether;
}

