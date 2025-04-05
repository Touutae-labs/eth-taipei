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
const CHAIN_ID = process.env.CHAIN_ID || 48898; // Default to Chain ID for testing
const PLANS_FILE = path.join(__dirname, "../data/plans.json");
const EXECUTION_HISTORY_FILE = path.join(__dirname, "../data/execution-history.json");
const LAST_BLOCK_FILE = path.join(__dirname, "../data/last-block.json");

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
let lastProcessedBlock = 0;

// Load existing data
function loadData() {
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
  
  if (fs.existsSync(LAST_BLOCK_FILE)) {
    const data = JSON.parse(fs.readFileSync(LAST_BLOCK_FILE, "utf8"));
    lastProcessedBlock = data.lastBlock || 0;
    console.log(`Resuming from block ${lastProcessedBlock}`);
  } else {
    fs.writeFileSync(LAST_BLOCK_FILE, JSON.stringify({ lastBlock: 0 }));
    console.log("Starting from block 0");
  }
}

// Poll for events instead of using filters
async function pollForEvents() {
  try {
    console.log("Polling for new events...");
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    
    // If this is our first run, start from a recent block to avoid processing the entire history
    if (lastProcessedBlock === 0) {
      // Start from 10000 blocks ago or block 0, whichever is greater
      lastProcessedBlock = Math.max(currentBlock - 10000, 0);
      console.log(`First run - starting from block ${lastProcessedBlock}`);
    }
    
    // Don't process too many blocks at once
    const toBlock = Math.min(lastProcessedBlock + 2000, currentBlock);
    
    if (lastProcessedBlock >= toBlock) {
      console.log("No new blocks to process");
      return;
    }
    
    console.log(`Fetching events from block ${lastProcessedBlock} to ${toBlock}`);
    
    // Get PlanCreated events
    const filter = contract.filters.PlanCreated();
    const events = await contract.queryFilter(filter, lastProcessedBlock, toBlock);
    
    console.log(`Found ${events.length} new PlanCreated events`);
    
    // Process events
    for (const event of events) {
      const planId = event.args[0];
      const user = event.args[1];
      const token = event.args[2];
      const amount = event.args[3];
      const interval = event.args[4];
      
      console.log(`New plan created: ${planId}`);
      
      // Get full plan details from contract
      try {
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
      } catch (error) {
        console.error(`Error fetching plan details for ${planId}:`, error);
      }
    }
    
    // Update last processed block
    lastProcessedBlock = toBlock;
    fs.writeFileSync(LAST_BLOCK_FILE, JSON.stringify({ lastBlock: lastProcessedBlock }));
    console.log(`Updated last processed block to ${lastProcessedBlock}`);
    
  } catch (error) {
    console.error("Error polling for events:", error);
  }
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
          try {
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
          } catch (txError) {
            console.error(`Transaction failed for plan ${plan.id}:`, txError);
          }
        } else {
          console.log(`Plan ${plan.id} not ready based on on-chain data.`);
        }
      }
    } catch (error) {
      console.error(`Error processing plan ${plan.id}:`, error);
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
  // Load saved data
  loadData();
  
  try {
    // Check if we can connect to the provider
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId.toString()})`);
    
    // Check if contract exists
    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (code === '0x') {
      console.error(`⚠️ WARNING: No contract found at address ${CONTRACT_ADDRESS}`);
      console.error(`Make sure your RPC_URL points to the correct network where your contract is deployed!`);
    } else {
      console.log(`✅ Contract verified at ${CONTRACT_ADDRESS}`);
    }
  } catch (error) {
    console.error("Failed to connect to provider:", error);
    process.exit(1);
  }
  
  // Schedule event polling - every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    await pollForEvents();
  });
  
  // Schedule plan execution checks - every minute
  cron.schedule("* * * * *", async () => {
    await checkAndExecutePlans();
  });
  
  // Initial run
  await pollForEvents();
  await checkAndExecutePlans();
  
  console.log("Relayer running. Press Ctrl+C to exit.");
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

// Start the relayer
main().catch(console.error);