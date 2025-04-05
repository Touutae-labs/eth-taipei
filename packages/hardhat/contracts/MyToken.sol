// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MyToken
 * @dev Modified ERC20 token with:
 * - Only DailySavingContract can mint tokens
 * - EIP-2612 permit support for gasless approvals
 * - Burning functionality
 */
contract MyToken is ERC20, ERC20Permit, ERC20Burnable, Ownable {
    // Maximum token supply cap
    uint256 public immutable maxSupply;
    
    // The only address allowed to mint tokens
    address public minter;
    
    // Events
    event MinterUpdated(address indexed newMinter);
    event TokensRecovered(address token, address recipient, uint256 amount);

    /**
     * @dev Constructor initializes the token with name, symbol, and initial supply
     * @param initialSupply Initial token supply to mint to the deployer
     * @param _maxSupply Maximum possible token supply (0 for unlimited)
     */
    constructor(uint256 initialSupply, uint256 _maxSupply)
        ERC20("ZircuitRewardToken", "ZRT")
        ERC20Permit("ZircuitRewardToken")
        Ownable(msg.sender)
    {
        require(_maxSupply == 0 || initialSupply <= _maxSupply, "Initial supply exceeds maximum");
        maxSupply = _maxSupply;
        
        // Mint initial supply to the deployer
        _mint(msg.sender, initialSupply);
    }

    /**
     * @dev Set the minter address (can only be called by owner)
     * @param _minter The address that will be allowed to mint tokens
     */
    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "Minter cannot be zero address");
        minter = _minter;
        emit MinterUpdated(_minter);
    }

    /**
     * @dev Function to mint new tokens (can only be called by the designated minter)
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Only minter can mint tokens");
        
        // Check maximum supply cap if enabled
        if (maxSupply > 0) {
            require(totalSupply() + amount <= maxSupply, "Mint would exceed maximum supply");
        }
        
        _mint(to, amount);
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