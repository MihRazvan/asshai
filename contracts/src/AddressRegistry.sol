// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AddressRegistry {
    struct VenueConfig {
        address vaultToken;
        address outputSettler;
        address oracle;
        uint256 chainId;
        bool active;
    }

    address public owner;
    mapping(bytes32 => VenueConfig) private venues;
    mapping(bytes32 => address) private tokens;
    mapping(uint256 => address) private inputSettlers;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event VenueSet(string chainName, string poolId, VenueConfig config);
    event TokenSet(string chainName, string symbol, address token);
    event InputSettlerSet(uint256 indexed chainId, address settler);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address initialOwner) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
        emit OwnershipTransferred(address(0), owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setVenue(
        string calldata chainName,
        string calldata poolId,
        VenueConfig calldata config
    ) external onlyOwner {
        require(config.chainId != 0, "Zero chain");
        venues[_venueKey(chainName, poolId)] = config;
        emit VenueSet(chainName, poolId, config);
    }

    function setToken(
        string calldata chainName,
        string calldata symbol,
        address token
    ) external onlyOwner {
        require(token != address(0), "Zero token");
        tokens[_tokenKey(chainName, symbol)] = token;
        emit TokenSet(chainName, symbol, token);
    }

    function setInputSettler(uint256 chainId, address settler) external onlyOwner {
        require(chainId != 0, "Zero chain");
        require(settler != address(0), "Zero settler");
        inputSettlers[chainId] = settler;
        emit InputSettlerSet(chainId, settler);
    }

    function getVenue(
        string calldata chainName,
        string calldata poolId
    ) external view returns (VenueConfig memory) {
        return venues[_venueKey(chainName, poolId)];
    }

    function getToken(
        string calldata chainName,
        string calldata symbol
    ) external view returns (address) {
        return tokens[_tokenKey(chainName, symbol)];
    }

    function getInputSettler(uint256 chainId) external view returns (address) {
        return inputSettlers[chainId];
    }

    function _venueKey(
        string calldata chainName,
        string calldata poolId
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(chainName, ":", poolId));
    }

    function _tokenKey(
        string calldata chainName,
        string calldata symbol
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(chainName, ":", symbol));
    }
}
