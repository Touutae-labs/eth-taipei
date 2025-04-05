const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function configureToken() {
  try {
    // Get values from environment variables
    const RPC_URL = process.env.RPC_URL;
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const dailySavingsAddress = process.env.DAILY_SAVINGS_ADDRESS || "0x7f88A4818B03053CB04d984d4E9aBE576afA10d0";
    const tokenToAdd = "0x4f0dfc7a638AA3f9b26F5aeA7f086526B269d53E";
    
    console.log("Connecting to provider...");
    
    // Validate inputs
    if (!RPC_URL) throw new Error("RPC_URL is missing in .env file");
    if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY is missing in .env file");
    
    // Clean private key (remove 0x if present)
    const cleanPrivateKey = PRIVATE_KEY.startsWith('0x') 
      ? PRIVATE_KEY.substring(2) 
      : PRIVATE_KEY;
    
    // Connect to provider and get signer
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const ownerWallet = new ethers.Wallet(cleanPrivateKey, provider);
    console.log(`Connected with address: ${ownerWallet.address}`);
    
    // Load ABI from file
    const abiPath = path.join(__dirname, "abi", "DailySavingContract.json");
    if (!fs.existsSync(abiPath)) {
      throw new Error(`ABI file not found at ${abiPath}`);
    }
    
    const DailySavingContractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    
    // Connect to the contract
    const dailySavings = new ethers.Contract(
      dailySavingsAddress,
      DailySavingContractABI.abi,
      ownerWallet
    );
    
    // Configure the token with a 5% yield rate (500 basis points)
    const yieldRate = 500; // 5% annual yield rate
    
    console.log(`Configuring token ${tokenToAdd} with ${yieldRate/100}% yield rate...`);
    
    // Call the configureToken function
    const tx = await dailySavings.configureToken(tokenToAdd, yieldRate);
    console.log(`Transaction sent: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`Token configured successfully in block ${receipt.blockNumber}`);
    
    // Initialize DailySavingContract as minter if not already
    const isMinter = await dailySavings.isMinter();
    console.log(`Current minter status: ${isMinter}`);

    const owner = await dailySavings.owner();
    console.log(`Contract owner: ${owner}`);
    console.log(`Caller address: ${ownerWallet.address}`);

    if (owner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
        console.log("⚠️ WARNING: You are not the owner of this contract!");
    }


    if (!isMinter && owner.toLowerCase() === ownerWallet.address.toLowerCase()) {
      console.log("Initializing contract as minter...");
      const mintTx = await dailySavings.initializeAsMinter();
      const mintReceipt = await mintTx.wait();
      console.log(`Contract initialized as minter in block ${mintReceipt.blockNumber}`);
    } else {
      console.log("Contract is already initialized as minter");
    }
  } catch (error) {
    console.error("Error details:");
    console.error(error);
  }
}

configureToken().catch(console.error);