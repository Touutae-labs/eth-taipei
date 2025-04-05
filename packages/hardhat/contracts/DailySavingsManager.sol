// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// EIP-7702 interface
interface IEIP7702 {
    function tokenData(uint256 tokenId) external view returns (bytes memory);
    event TokenDataUpdated(uint256 indexed tokenId, bytes data);
}

// Simple interface for ERC-4337 EntryPoint
interface IEntryPoint {
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }
    
    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external;
}

/**
 * @title DailySavingsManager
 * @dev A subscription manager for daily savings transfers with ERC-4337 and EIP-7702 support
 */
contract DailySavingsManager {
    using ECDSA for bytes32;

    struct Subscription {
        address receiver;
        uint256 amountPerDay;
        uint256 lastExecuted;
        bool active;
        uint256 tokenId;        // EIP-7702 token ID (if used)
        address tokenContract;   // EIP-7702 token contract (if used)
    }

    // Owner of the contract
    address public owner;
    // Nonce for EIP-712 signatures
    mapping(address => uint256) public nonces;

    // User address to subscription details
    mapping(address => Subscription) public subscriptions;
    
    // Authorized relayers
    mapping(address => bool) public authorizedRelayers;
    
    // EntryPoint contract for ERC-4337
    address public immutable entryPoint;
    
    // Domain separator for EIP-712
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    // Type hash for subscription
    bytes32 public constant SUBSCRIPTION_TYPEHASH = keccak256(
        "Subscription(address user,address receiver,uint256 amountPerDay,uint256 deadline,uint256 tokenId,address tokenContract,uint256 nonce)"
    );

    // Events
    event Subscribed(address indexed user, address indexed receiver, uint256 amount, uint256 tokenId, address tokenContract);
    event Executed(address indexed user, uint256 amount);
    event RelayerUpdated(address indexed relayer, bool authorized);
    event SubscriptionCancelled(address indexed user);

    /**
     * @dev Constructor sets the EntryPoint and domain separator
     * @param _entryPoint Address of the ERC-4337 EntryPoint contract
     */
    
    constructor(address _entryPoint) {
        entryPoint = _entryPoint;
        owner = msg.sender;

        authorizedRelayers[msg.sender] = true; // Optional: pre-authorize deployer

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("DailySavingsManager")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }


    /**
     * @dev Modifier to restrict function access to authorized relayers
     */
    modifier onlyRelayer() {
        require(authorizedRelayers[msg.sender], "Caller not authorized relayer");
        _;
    }
    
    /**
     * @dev Modifier to restrict function access to the EntryPoint
     */
    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "Caller not EntryPoint");
        _;
    }

    /**
     * @dev Modifier to restrict function access to the contract owner
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @dev Subscribe to daily savings
     * @param receiver Address to receive the daily transfers
     * @param amountPerDay Amount to transfer daily
     */
    function subscribe(address receiver, uint256 amountPerDay) external {
        _subscribe(msg.sender, receiver, amountPerDay, 0, address(0));
    }
    
    /**
     * @dev Subscribe to daily savings with EIP-7702 token binding
     * @param receiver Address to receive the daily transfers
     * @param amountPerDay Amount to transfer daily
     * @param tokenId ID of the EIP-7702 token to bind subscription data to
     * @param tokenContract Address of the EIP-7702 compliant contract
     */
    function subscribeWithToken(
        address receiver, 
        uint256 amountPerDay, 
        uint256 tokenId, 
        address tokenContract
    ) external {
        require(tokenContract != address(0), "Invalid token contract");
        require(
            IERC165(tokenContract).supportsInterface(type(IEIP7702).interfaceId), 
            "Contract does not support EIP-7702"
        );
        
        _subscribe(msg.sender, receiver, amountPerDay, tokenId, tokenContract);
    }

    /**
     * @dev Subscribe with signature (meta-transaction)
     * @param user User address that will provide the funds
     * @param receiver Address to receive the daily transfers
     * @param amountPerDay Amount to transfer daily
     * @param deadline Expiration timestamp for this signature
     * @param v ECDSA signature parameter v
     * @param r ECDSA signature parameter r
     * @param s ECDSA signature parameter s
     */
    function subscribeWithSig(
        address user,
        address receiver,
        uint256 amountPerDay,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        require(block.timestamp <= deadline, "Expired");

        bytes32 hash = keccak256(abi.encodePacked(user, receiver, amountPerDay, deadline));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        address signer = ecrecover(ethSignedMessageHash, v, r, s);
        
        require(signer == user, "Invalid signature");

        _subscribe(user, receiver, amountPerDay, 0, address(0));
    }
    
    /**
     * @dev Subscribe with EIP-712 signature and token binding
     * @param user User address that will provide the funds
     * @param receiver Address to receive the daily transfers
     * @param amountPerDay Amount to transfer daily
     * @param deadline Expiration timestamp for this signature
     * @param tokenId ID of the EIP-7702 token to bind subscription data to
     * @param tokenContract Address of the EIP-7702 compliant contract
     * @param signature EIP-712 signature
     */
    function subscribeWithEIP712(
        address user,
        address receiver,
        uint256 amountPerDay,
        uint256 deadline,
        uint256 tokenId,
        address tokenContract,
        bytes memory signature
    ) external {
        require(block.timestamp <= deadline, "Expired");

        uint256 currentNonce = nonces[user];

        bytes32 structHash = keccak256(
            abi.encode(
                SUBSCRIPTION_TYPEHASH,
                user,
                receiver,
                amountPerDay,
                deadline,
                tokenId,
                tokenContract,
                currentNonce
            )
        );

        
        bytes32 hash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        
        address signer = hash.recover(signature);
        require(signer == user, "Invalid signature");
        nonces[user]++; // prevent replay

        _subscribe(user, receiver, amountPerDay, tokenId, tokenContract);
    }

    /**
     * @dev Internal function to subscribe a user
     */
    function _subscribe(
        address user, 
        address receiver, 
        uint256 amountPerDay,
        uint256 tokenId,
        address tokenContract
    ) internal {
        require(receiver != address(0), "Invalid receiver");
        require(amountPerDay > 0, "Invalid amount");

        subscriptions[user] = Subscription({
            receiver: receiver,
            amountPerDay: amountPerDay,
            lastExecuted: block.timestamp,
            active: true,
            tokenId: tokenId,
            tokenContract: tokenContract
        });

        emit Subscribed(user, receiver, amountPerDay, tokenId, tokenContract);
    }

    /**
     * @dev Cancel subscription
     */
    function cancel() external {
        _cancelSubscription(msg.sender);
    }
    
    /**
     * @dev Cancel subscription for another user (only callable by authorized relayers)
     * @param user Address of the user to cancel subscription for
     */
    function cancelFor(address user) external onlyRelayer {
        _cancelSubscription(user);
    }
    
    /**
     * @dev Internal function to cancel a subscription
     */
    function _cancelSubscription(address user) internal {
        Subscription storage sub = subscriptions[user];
        require(sub.active, "Not active");
        sub.active = false;
        
        emit SubscriptionCancelled(user);
    }

    /**
     * @dev Execute a subscription transfer
     * @param user User whose subscription to execute
     * @param tokenAddress Token contract address for the transfer
     */
    function execute(address user, address tokenAddress) external {
        _executeSubscription(user, tokenAddress);
    }
    
    /**
     * @dev Execute multiple subscription transfers (gas efficient)
     * @param users Array of users whose subscriptions to execute
     * @param tokenAddress Token contract address for the transfers
     */
    function executeBatch(address[] calldata users, address tokenAddress) external {
        for (uint i = 0; i < users.length; i++) {
            _executeSubscription(users[i], tokenAddress);
        }
    }
    
    /**
     * @dev Execute subscription using EIP-7702 token data
     * @param user User whose subscription to execute
     * @param tokenAddress Token contract address for the transfer
     */
    function executeWithTokenData(address user, address tokenAddress) external onlyRelayer {
        Subscription storage sub = subscriptions[user];
        require(sub.active, "Not active");
        require(block.timestamp >= sub.lastExecuted + 1 days, "Too early");
        require(sub.tokenId > 0 && sub.tokenContract != address(0), "No token binding");
        
        // Get subscription data from EIP-7702 token
        bytes memory tokenData = IEIP7702(sub.tokenContract).tokenData(sub.tokenId);
        
        // Validate the token data (e.g., checking permissions, expiration, etc.)
        require(tokenData.length > 0, "Invalid token data");
        
        // Execute the transfer
        sub.lastExecuted = block.timestamp;
        IERC20 token = IERC20(tokenAddress);
        require(token.transferFrom(user, sub.receiver, sub.amountPerDay), "Transfer failed");
        
        emit Executed(user, sub.amountPerDay);
    }

    /**
     * @dev Internal function to execute a subscription
     */
    function _executeSubscription(address user, address tokenAddress) internal {
        Subscription storage sub = subscriptions[user];
        require(sub.active, "Not active");
        require(block.timestamp >= sub.lastExecuted + 1 days, "Too early");

        sub.lastExecuted = block.timestamp;

        IERC20 token = IERC20(tokenAddress);
        require(token.transferFrom(user, sub.receiver, sub.amountPerDay), "Transfer failed");

        emit Executed(user, sub.amountPerDay);
    }
    
    /**
     * @dev Set authorization for a relayer
     * @param relayer Address of the relayer
     * @param authorized Whether to authorize or deauthorize
     */
    function setRelayerAuthorization(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        
        emit RelayerUpdated(relayer, authorized);
    }
    
    /**
     * @dev Validate a UserOperation for ERC-4337
     * @param userOp User operation to validate
     * @param requiredPrefund Amount of ETH required for prefunding
     * @return validationData Result of validation
     */
    function validateUserOp(
        IEntryPoint.UserOperation calldata userOp, 
        bytes32 /*userOpHash*/, 
        uint256 requiredPrefund
    ) external onlyEntryPoint returns (uint256 validationData) {
        // Decode calldata to get function selector and parameters
        (bytes4 selector, bytes memory params) = abi.decode(userOp.callData, (bytes4, bytes));
        
        // Perform validation based on the function being called
        // Return 0 for valid operations or timestamp until which the signature is valid
        
        // For simplicity, we'll just validate that the sender has enough ETH for prefunding
        require(address(this).balance >= requiredPrefund, "Insufficient ETH for gas");
        
        // Return 0 to indicate successful validation
        return 0;
    }
    
    /**
     * @dev Function to execute arbitrary contract calls (for ERC-4337 compatibility)
     * @param target Address to call
     * @param data Call data
     * @return result Return data from the call
     */
    function execute(address target, bytes calldata data) external onlyEntryPoint returns (bytes memory result) {
        (bool success, bytes memory returnData) = target.call(data);
        require(success, "Transaction execution failed");
        return returnData;
    }
    
    /**
     * @dev Function to get subscription details with payload from EIP-7702 token
     * @param user User address
     * @return subscription Subscription details
     * @return tokenPayload Token payload if available
     */
    function getSubscriptionWithPayload(address user) external view returns (
        Subscription memory subscription,
        bytes memory tokenPayload
    ) {
        subscription = subscriptions[user];
        
        // If subscription is bound to a token, get its data
        if (subscription.tokenId > 0 && subscription.tokenContract != address(0)) {
            try IEIP7702(subscription.tokenContract).tokenData(subscription.tokenId) returns (bytes memory data) {
                tokenPayload = data;
            } catch {
                // If call fails, return empty bytes
                tokenPayload = "";
            }
        } else {
            tokenPayload = "";
        }
        
        return (subscription, tokenPayload);
    }
    
    /**
     * @dev Receive function to accept ETH (required for ERC-4337 gas payments)
     */
    receive() external payable {}
}