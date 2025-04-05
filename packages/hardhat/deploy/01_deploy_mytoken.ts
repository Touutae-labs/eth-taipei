import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DailySavingsManager, MyToken } from "../typechain-types";

// Zircuit EntryPoint address for ERC-4337
const ENTRY_POINT_ADDRESS = "0x0576a174D229E3cFA37253523E645A78A0C91B57";

const deployContracts = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // For clear logging
  console.log("\n----- Deploying Contracts -----\n");
  console.log(`🔑 Deployer: ${deployer}`);

  // 1. Deploy MyToken
  const initialSupply = ethers.parseEther("10000000");
  const maxSupply = ethers.parseEther("10000000");

  console.log(`📝 Deploying MyToken with initial supply: ${ethers.formatEther(initialSupply)} MTK`);

  const myTokenDeployment = await deploy("MyToken", {
    from: deployer,
    args: [initialSupply, maxSupply],
    log: true,
    autoMine: true,
  });

  console.log(`✅ MyToken deployed at ${myTokenDeployment.address}`);

  // 2. Deploy DailySavingsManager
  console.log(`\n📝 Deploying DailySavingsManager with EntryPoint: ${ENTRY_POINT_ADDRESS}`);

  const dailySavingsManagerDeployment = await deploy("DailySavingsManager", {
    from: deployer,
    args: [ENTRY_POINT_ADDRESS],
    log: true,
    autoMine: true,
  });

  console.log(`✅ DailySavingsManager deployed at ${dailySavingsManagerDeployment.address}`);

  // 3. Get contract instances for post-deployment setup
  const myToken = await hre.ethers.getContract<MyToken>("MyToken", deployer);
  const dailySavingsManager = await hre.ethers.getContract<DailySavingsManager>("DailySavingsManager", deployer);

  // 4. Setup: Transfer tokens to test addresses if needed
  console.log("\n----- Setting Up Test Environment -----\n");

  // Get signers for testing
  const signers = await hre.ethers.getSigners();
  const testUser = signers[1]; // Use the second account as a test user

  if (testUser) {
    const testAmount = ethers.parseEther("1000");
    console.log(`🏦 Transferring ${ethers.formatEther(testAmount)} MTK to test user: ${testUser.address}`);

    const tx = await myToken.transfer(testUser.address, testAmount);
    await tx.wait();

    const testUserBalance = await myToken.balanceOf(testUser.address);
    console.log(`✅ Test user balance: ${ethers.formatEther(testUserBalance)} MTK`);
  }

  // 5. Optional: Add test user as an authorized relayer
  console.log(`\n🔐 Setting up authorized relayer: ${testUser.address}`);
  await dailySavingsManager.setRelayerAuthorization(testUser.address, true);
  console.log(`✅ Relayer authorization set`);

  // 6. Verify everything is set up correctly
  console.log("\n----- Verification -----\n");

  const deployerBalance = await myToken.balanceOf(deployer);
  console.log(`👑 Deployer balance: ${ethers.formatEther(deployerBalance)} MTK`);

  const isRelayerAuthorized = await dailySavingsManager.authorizedRelayers(testUser.address);
  console.log(`🔑 Test user is authorized relayer: ${isRelayerAuthorized}`);

  // Add network information
  const network = await hre.ethers.provider.getNetwork();
  console.log(`\n🌐 Deployed on network: ${network.name} (chainId: ${network.chainId})`);

  console.log("\n----- Deployment Complete -----\n");

  // Return the deployed contract addresses for testing
  return {
    myTokenAddress: myTokenDeployment.address,
    dailySavingsManagerAddress: dailySavingsManagerDeployment.address,
  };
};

export default deployContracts;
deployContracts.tags = ["DailySavings", "MyToken"];
