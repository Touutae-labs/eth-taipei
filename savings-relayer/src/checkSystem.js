const { ethers } = require("ethers");
require("dotenv").config();

async function checkSystem() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const tokenAddress = "0x4f0dfc7a638AA3f9b26F5aeA7f086526B269d53E";
  const dailySavingsAddress = process.env.DAILY_SAVINGS_ADDRESS;
  
  console.log("Checking system configuration...");
  
  try {
    // Check if token is configured in DailySavings
    const tokenConfigAbi = ["function tokenConfigs(address) view returns (uint256 yieldRate, bool allowed)"];
    const dailySavings = new ethers.Contract(dailySavingsAddress, tokenConfigAbi, provider);
    const config = await dailySavings.tokenConfigs(tokenAddress);
    
    // Fix: Convert BigInt to Number before division
    console.log(`Token configuration: Yield Rate = ${Number(config.yieldRate)/100}%, Allowed = ${config.allowed}`);
    
    // Check if DailySavings is minter for token
    const tokenAbi = ["function minter() view returns (address)"];
    const token = new ethers.Contract(tokenAddress, tokenAbi, provider);
    const minter = await token.minter();
    console.log(`Token minter: ${minter}`);
    console.log(`DailySavings address: ${dailySavingsAddress}`);
    console.log(`Minter configured correctly: ${minter.toLowerCase() === dailySavingsAddress.toLowerCase()}`);
    
    return {
      tokenConfigured: config.allowed,
      minterConfigured: minter.toLowerCase() === dailySavingsAddress.toLowerCase()
    };
  } catch (error) {
    console.error("Error checking system:", error);
  }
}

checkSystem().catch(console.error);