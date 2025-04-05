import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

// Zircuit EntryPoint address
const ENTRY_POINT_ADDRESS = "0x0576a174D229E3cFA37253523E645A78A0C91B57";

const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const initialSupply = ethers.parseEther("10000000");
  const maxSupply = ethers.parseEther("10000000"); // or more if needed

  const myTokenDeployment = await deploy("MyToken", {
    from: deployer,
    args: [initialSupply, maxSupply],
    log: true,
    autoMine: true,
  });

  console.log(`✅ MyToken deployed at ${myTokenDeployment.address}`);

  const dailySavingsManagerDeployment = await deploy("DailySavingsManager", {
    from: deployer,
    args: [ENTRY_POINT_ADDRESS],
    log: true,
    autoMine: true,
  });

  console.log(`✅ DailySavingsManager deployed at ${dailySavingsManagerDeployment.address}`);

  // Optional: Transfer some tokens to test address or contract
  const myToken = await hre.ethers.getContract("MyToken", deployer);
  const transferAmount = ethers.parseEther("1000");

  // Example: Send tokens to manager for demo
  await myToken.transfer(dailySavingsManagerDeployment.address, transferAmount);
  console.log(`✅ Sent ${ethers.formatEther(transferAmount)} MTK to DailySavingsManager`);
};

export default deployContracts;
deployContracts.tags = ["DailySavings", "MyToken"];
