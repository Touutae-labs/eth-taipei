// Save as setMinter.js
const { ethers } = require("ethers");
require("dotenv").config();

async function setMinter() {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  
  // Replace with your actual token address
  const myTokenAddress = "0x4f0dfc7a638AA3f9b26F5aeA7f086526B269d53E";
  const dailySavingsAddress = process.env.DAILY_SAVINGS_ADDRESS;
  
  // Connect to provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  // MyToken ABI (just the function we need)
  const tokenAbi = [
    "function setMinter(address _minter) external",
    "function minter() view returns (address)"
  ];
  
  const tokenContract = new ethers.Contract(myTokenAddress, tokenAbi, wallet);
  
  try {
    console.log(`Setting minter to ${dailySavingsAddress}...`);
    const tx = await tokenContract.setMinter(dailySavingsAddress);
    await tx.wait();
    console.log(`Transaction confirmed!`);
    
    const minter = await tokenContract.minter();
    console.log(`New minter address: ${minter}`);
    
  } catch (error) {
    console.error("Error:", error);
  }
}

setMinter().catch(console.error);