import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Zircuit EntryPoint address for ERC-4337
const ENTRY_POINT_ADDRESS = "0x0576a174D229E3cFA37253523E645A78A0C91B57";

const deployContracts = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("\n----- Deploying Contracts -----\n");
  console.log(`🔑 Deployer: ${deployer}`);

  // Token args
  const initialSupply = ethers.parseEther("10000000"); // 10 million MTK
  const maxSupply = ethers.parseEther("10000000"); // Cap at 10 million

  // 1. Deploy MyToken
  console.log(`📝 Deploying MyToken...`);
  const myTokenDeployment = await deploy("MyToken", {
    from: deployer,
    args: [initialSupply, maxSupply],
    log: true,
    autoMine: true,
  });
  console.log(`✅ MyToken deployed at: ${myTokenDeployment.address}`);
  console.log(`🔧 MyToken constructor args: [${initialSupply.toString()}, ${maxSupply.toString()}]`);

  // 2. Deploy DailySavingsManager
  console.log(`\n📝 Deploying YieldSavingsVaultWithRelayer...`);
  const dailySavingsManagerDeployment = await deploy("YieldSavingsVaultWithRelayer", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
  console.log(`✅ YieldSavingsVaultWithRelayer deployed at: ${dailySavingsManagerDeployment.address}`);
  console.log(`🔧 YieldSavingsVaultWithRelayer constructor args: ["${ENTRY_POINT_ADDRESS}"]`);

  // Network info
  const network = await hre.ethers.provider.getNetwork();
  console.log(`\n🌐 Deployed on network: ${network.name} (chainId: ${network.chainId})`);

  console.log("\n----- Deployment Complete -----\n");

  return {
    myTokenAddress: myTokenDeployment.address,
    dailySavingsManagerAddress: dailySavingsManagerDeployment.address,
  };
};

export default deployContracts;
deployContracts.tags = ["DailySavings", "MyToken"];
