// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MyToken.sol";  // Import the MyToken contract

contract DailySavingContract is Ownable(msg.sender), ReentrancyGuard {
    using ECDSA for bytes32;

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant PRECISION = 1e18;

    struct SavingPlan {
        address user;
        address token;
        uint256 amountPerInterval;
        uint256 interval;
        uint256 lastExecuted;
        bool active;
    }

    struct TokenConfig {
        uint256 yieldRate; // Annualized yield rate in basis points
        bool allowed;
    }

    // Gas fee structure
    struct GasFeeConfig {
        address feeToken;     // Token used for gas fee payments
        uint256 baseFee;      // Base fee per execution in feeToken units
        uint256 percentFee;   // Additional percentage fee in BASIS_POINTS
        bool active;          // If fee collection is active
    }

    MyToken public immutable rewardToken;
    mapping(bytes32 => SavingPlan) public plans;
    mapping(address => mapping(address => uint256)) public userBalances; // user => token => balance
    mapping(address => TokenConfig) public tokenConfigs;
    mapping(address => bool) public relayers;
    
    // Tracks relayer gas reimbursements
    mapping(address => uint256) public relayerRewards;
    GasFeeConfig public gasFeeConfig;

    event PlanCreated(bytes32 indexed planId, address indexed user, address token, uint256 amountPerInterval, uint256 interval);
    event PlanExecuted(bytes32 indexed planId, uint256 amountSaved, uint256 reward, uint256 gasFee);
    event RelayerSet(address relayer, bool active);
    event TokenConfigured(address token, uint256 yieldRate);
    event YieldDistributed(address indexed user, uint256 amount);
    event GasFeeConfigured(address feeToken, uint256 baseFee, uint256 percentFee);
    event RelayerRewardsCollected(address indexed relayer, uint256 amount);

    constructor(address _rewardToken) {
        require(_rewardToken != address(0), "Invalid reward token");
        rewardToken = MyToken(_rewardToken);
        relayers[msg.sender] = true;
    }

    /**
     * @dev Initialize the contract as the minter for the reward token
     * This function should be called after deployment
     */
    // Track if we're already initialized as minter
    bool public isMinter = false;
    
    function initializeAsMinter() external onlyOwner {
        require(!isMinter, "Already initialized as minter");
        
        // Call the setMinter function on the reward token
        MyToken(address(rewardToken)).setMinter(address(this));
        isMinter = true;
    }

    /**
     * @dev Configure the gas fee structure for relayers
     * @param feeToken Token used to pay gas fees
     * @param baseFee Base fee per execution in token units
     * @param percentFee Additional percentage fee in BASIS_POINTS
     */
    function setGasFeeConfig(address feeToken, uint256 baseFee, uint256 percentFee) external onlyOwner {
        require(feeToken != address(0), "Invalid fee token");
        require(percentFee <= BASIS_POINTS, "Percent fee too high");
        
        gasFeeConfig = GasFeeConfig({
            feeToken: feeToken,
            baseFee: baseFee,
            percentFee: percentFee,
            active: true
        });
        
        emit GasFeeConfigured(feeToken, baseFee, percentFee);
    }

    /**
     * @dev Toggle gas fee collection
     * @param active Whether fee collection is active
     */
    function toggleGasFeeCollection(bool active) external onlyOwner {
        gasFeeConfig.active = active;
    }

    modifier onlyRelayer() {
        require(relayers[msg.sender], "Not a relayer");
        _;
    }

    function setRelayer(address relayer, bool active) external onlyOwner {
        relayers[relayer] = active;
        emit RelayerSet(relayer, active);
    }

    function configureToken(address token, uint256 yieldRateBps) external onlyOwner {
        require(yieldRateBps <= BASIS_POINTS, "Too high");
        tokenConfigs[token] = TokenConfig({yieldRate: yieldRateBps, allowed: true});
        emit TokenConfigured(token, yieldRateBps);
    }

    // Add to DailySavingContract
    function createPlanWithDelegatedPermit(
        address user,          // The EOA who signed the permit
        address token,
        uint256 amount,
        uint256 intervalSeconds,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(tokenConfigs[token].allowed, "Token not supported");
        require(amount > 0 && intervalSeconds > 0, "Invalid params");

        // Permit approval with user as signer but funds come from msg.sender (the smart account)
        IERC20Permit(token).permit(user, address(this), amount, deadline, v, r, s);

        bytes32 planId = keccak256(abi.encodePacked(msg.sender, token, block.timestamp));
        plans[planId] = SavingPlan({
            user: msg.sender,    // The smart account address that will provide funds
            token: token,
            amountPerInterval: amount,
            interval: intervalSeconds,
            lastExecuted: block.timestamp,
            active: true
        });

        emit PlanCreated(planId, msg.sender, token, amount, intervalSeconds);
    }

    function executePlan(bytes32 planId) external onlyRelayer nonReentrant {
        SavingPlan storage plan = plans[planId];
        require(plan.active, "Plan inactive");
        require(block.timestamp >= plan.lastExecuted + plan.interval, "Too soon");

        TokenConfig memory config = tokenConfigs[plan.token];
        require(config.allowed, "Token disabled");

        // Pull from user (allowance must exist)
        IERC20(plan.token).transferFrom(plan.user, address(this), plan.amountPerInterval);
        
        // Calculate reward in rewardToken
        uint256 yield = (plan.amountPerInterval * config.yieldRate * plan.interval) / (365 days * BASIS_POINTS);

        // Calculate gas fee (if enabled)
        uint256 gasFee = 0;
        if (gasFeeConfig.active) {
            // Base fee + percentage of saved amount
            gasFee = gasFeeConfig.baseFee;
            
            if (gasFeeConfig.percentFee > 0 && gasFeeConfig.feeToken == plan.token) {
                // Only apply percentage fee if the fee token is the same as the saving token
                uint256 percentageFee = (plan.amountPerInterval * gasFeeConfig.percentFee) / BASIS_POINTS;
                gasFee += percentageFee;
            }
            
            // Ensure we don't take more than what was transferred
            if (gasFee > 0 && gasFee <= plan.amountPerInterval && gasFeeConfig.feeToken == plan.token) {
                // Credit the relayer
                relayerRewards[msg.sender] += gasFee;
            }
        }

        // Mint reward token directly to user
        rewardToken.mint(plan.user, yield);

        // Update execution timestamp
        plan.lastExecuted = block.timestamp;

        emit PlanExecuted(planId, plan.amountPerInterval, yield, gasFee);
        emit YieldDistributed(plan.user, yield);
    }

    /**
     * @dev Allow relayers to collect their accumulated rewards
     */
    function collectRelayerRewards() external nonReentrant {
        uint256 amount = relayerRewards[msg.sender];
        require(amount > 0, "No rewards to collect");
        
        // Reset rewards before transfer to prevent reentrancy
        relayerRewards[msg.sender] = 0;
        
        // Transfer the fee token to the relayer
        IERC20(gasFeeConfig.feeToken).transfer(msg.sender, amount);
        
        emit RelayerRewardsCollected(msg.sender, amount);
    }
}