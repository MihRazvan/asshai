// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IJsonApiAgent {
    function fetchString(string calldata url, string calldata selector)
        external
        returns (string memory result);

    function fetchUint(string calldata url, string calldata selector, uint8 decimals)
        external
        returns (uint256 result);

    function fetchInt(string calldata url, string calldata selector, uint8 decimals)
        external
        returns (int256 result);

    function fetchBool(string calldata url, string calldata selector)
        external
        returns (bool result);

    function fetchStringArray(string calldata url, string calldata selector)
        external
        returns (string[] memory result);

    function fetchUintArray(string calldata url, string calldata selector, uint8 decimals)
        external
        returns (uint256[] memory result);
}

