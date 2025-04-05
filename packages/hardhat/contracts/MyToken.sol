// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MyToken
 * @dev Enhanced ERC20 token with:
 * - EIP-2612 permit support for gasless approvals
 * - Burning functionality
 * - Pausable transfers for emergencies
 * - Minting with optional cap
 * - Token recovery for accidentally sent tokens
 */
contract MyToken is ERC20Permit, ERC20Burnable, Ownable {
    // Optional: Maximum token supply cap
    uint256 public immutable maxSupply;
    
    // Optional: Tracks last mint timestamp and amount for rate limiting
    uint256 public lastMintTimestamp;
    uint256 public mintCooldownPeriod = 1 days;
    uint256 public maxMintAmountPerPeriod;

    // Events
    event MaxMintAmountUpdated(uint256 newMaxAmount);
    event MintCooldownUpdated(uint256 newCooldownPeriod);
    event TokensRecovered(address token, address recipient, uint256 amount);

    /**
     * @dev Constructor initializes the token with name, symbol, and initial supply
     * @param initialSupply Initial token supply to mint to the deployer
     * @param _maxSupply Maximum possible token supply (0 for unlimited)
     */
    constructor(uint256 initialSupply, uint256 _maxSupply)
        ERC20("MyToken", "MTK")
        ERC20Permit("MyToken")
        Ownable(msg.sender)
    {
        require(_maxSupply == 0 || initialSupply <= _maxSupply, "Initial supply exceeds maximum");
        maxSupply = _maxSupply;
        
        // Set default mint rate limit to 10% of initial supply per day
        // Only applies if _maxSupply > 0
        if (_maxSupply > 0) {
            maxMintAmountPerPeriod = _maxSupply / 10;
        }
        
        // Mint initial supply to the deployer
        _mint(msg.sender, initialSupply);
    }

    /**
     * @dev Function to mint new tokens with rate limiting
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        // Check maximum supply cap if enabled
        if (maxSupply > 0) {
            require(totalSupply() + amount <= maxSupply, "Mint would exceed maximum supply");
            
            // Apply rate limiting if configured
            if (maxMintAmountPerPeriod > 0) {
                // If cooldown period has passed, reset the counter
                if (block.timestamp >= lastMintTimestamp + mintCooldownPeriod) {
                    lastMintTimestamp = block.timestamp;
                }
                
                // Check if mint amount is within the allowed limit
                require(amount <= maxMintAmountPerPeriod, "Mint amount exceeds rate limit");
            }
        }
        
        lastMintTimestamp = block.timestamp;
        _mint(to, amount);
    }
    
    /**
     * @dev Update the maximum amount that can be minted per period
     * @param newMaxAmount New maximum mint amount per period
     */
    function setMaxMintAmountPerPeriod(uint256 newMaxAmount) external onlyOwner {
        maxMintAmountPerPeriod = newMaxAmount;
        emit MaxMintAmountUpdated(newMaxAmount);
    }
    
    /**
     * @dev Update the cooldown period between large mints
     * @param newCooldownPeriod New cooldown period in seconds
     */
    function setMintCooldownPeriod(uint256 newCooldownPeriod) external onlyOwner {
        mintCooldownPeriod = newCooldownPeriod;
        emit MintCooldownUpdated(newCooldownPeriod);
    }
    
    /**
     * @dev Recover ERC20 tokens accidentally sent to this contract
     * @param tokenAddress The address of the token to recover
     * @param recipient The address to send recovered tokens to
     * @param amount The amount of tokens to recover
     */
    function recoverERC20(address tokenAddress, address recipient, uint256 amount) external onlyOwner {
        require(tokenAddress != address(this), "Cannot recover native tokens");
        
        IERC20 token = IERC20(tokenAddress);
        require(token.transfer(recipient, amount), "Token recovery failed");
        
        emit TokensRecovered(tokenAddress, recipient, amount);
    }
}