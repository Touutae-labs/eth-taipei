const { ethers } = require("ethers");
const fs = require("fs");
const cron = require("node-cron");
const path = require("path");
require("dotenv").config();

// Contract ABI - only the functions and events we need
const CONTRACT_ABI = [
  "event PlanCreated(bytes32 indexed planId, address indexed user, address token, uint256 amountPerInterval, uint256 interval)",
  "function executePlan(bytes32 planId) external",
  "function plans(bytes32 planId) view returns (address user, address token, uint256 amountPerInterval, uint256 interval, uint256 lastExecuted, bool active)"
];

// Configuration
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.DAILY_SAVINGS_ADDRESS;
const PLANS_FILE = path.join(__dirname, "../data/plans.json");
const EXECUTION_HISTORY_FILE = path.join(__dirname, "../data/execution-history.json");

// Ensure data directory exists
const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

// Load or initialize plans
let plans = {};
let executionHistory = [];

if (fs.existsSync(PLANS_FILE)) {
  plans = JSON.parse(fs.readFileSync(PLANS_FILE, "utf8"));
  console.log(`Loaded ${Object.keys(plans).length} plans from file`);
} else {
  fs.writeFileSync(PLANS_FILE, JSON.stringify({}));
  console.log("Initialized empty plans file");
}

if (fs.existsSync(EXECUTION_HISTORY_FILE)) {
  executionHistory = JSON.parse(fs.readFileSync(EXECUTION_HISTORY_FILE, "utf8"));
  console.log(`Loaded ${executionHistory.length} execution records from file`);
} else {
  fs.writeFileSync(EXECUTION_HISTORY_FILE, JSON.stringify([]));
  console.log("Initialized empty execution history file");
}

// Listen for new plan creation events
async function startEventListener() {
  console.log("Starting event listener for PlanCreated events...");
  
  contract.on("PlanCreated", async (planId, user, token, amount, interval, event) => {
    console.log(`New plan created: ${planId}`);
    
    // Get full plan details from contract
    const planDetails = await contract.plans(planId);
    
    // Store plan with details
    plans[planId] = {
      id: planId,
      user: user,
      token: token,
      amountPerInterval: amount.toString(),
      interval: interval.toString(),
      lastExecuted: planDetails.lastExecuted.toString(),
      active: planDetails.active
    };
    
    // Save to JSON
    fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2));
    console.log(`Plan ${planId} saved to file`);
  });
  
  console.log("Event listener started");
}

// Check and execute plans that are ready
async function checkAndExecutePlans() {
  console.log("Checking for plans ready to execute...");
  const now = Math.floor(Date.now() / 1000); // Current timestamp
  const plansArray = Object.values(plans);
  
  let executedCount = 0;
  
  // Process plans in batches to avoid too many concurrent requests
  for (const plan of plansArray) {
    try {
      // Skip if plan is not active
      if (!plan.active) continue;
      
      // Check if the plan is ready for execution (current time >= last execution + interval)
      const nextExecutionTime = parseInt(plan.lastExecuted) + parseInt(plan.interval);
      
      if (now >= nextExecutionTime) {
        console.log(`Plan ${plan.id} is ready for execution. Executing...`);
        
        // Double-check on-chain status to avoid unnecessary transactions
        const onChainPlan = await contract.plans(plan.id);
        
        if (onChainPlan.active && (now >= parseInt(onChainPlan.lastExecuted) + parseInt(onChainPlan.interval))) {
          // Execute plan
          const tx = await contract.executePlan(plan.id);
          const receipt = await tx.wait();
          
          console.log(`Plan ${plan.id} executed! Transaction hash: ${receipt.hash}`);
          
          // Update local record with new lastExecuted time
          plan.lastExecuted = now.toString();
          executedCount++;
          
          // Record execution
          executionHistory.push({
            planId: plan.id,
            timestamp: now,
            txHash: receipt.hash,
            gasUsed: receipt.gasUsed.toString(),
          });
        } else {
          console.log(`Plan ${plan.id} not ready based on on-chain data.`);
        }
      }
    } catch (error) {
      console.error(`Error executing plan ${plan.id}:`, error);
    }
  }
  
  // Save updated plans and execution history
  if (executedCount > 0) {
    fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2));
    fs.writeFileSync(EXECUTION_HISTORY_FILE, JSON.stringify(executionHistory, null, 2));
    console.log(`Executed ${executedCount} plans, data saved.`);
  } else {
    console.log("No plans ready for execution");
  }
}

// Main function
async function main() {
  // Start event listener
  await startEventListener();
  
  // Schedule cron job to run every minute (adjust as needed)
  // "* * * * *" = every minute
  cron.schedule("* * * * *", async () => {
    await checkAndExecutePlans();
  });
  
  console.log("Relayer running. Press Ctrl+C to exit.");
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

// Start the relayer
main().catch(console.error);