import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-gas-reporter";
import { HardhatUserConfig, task } from "hardhat/config";
import "solidity-coverage";
import generateTsAbis from "./scripts/generateTsAbis";

dotenv.config();

// Use your own Zircuit deployer private key from .env
const deployerPrivateKey = process.env.ZIRCUIT_DEPLOYER_PRIVATE_KEY ?? "0xYOUR_FAKE_KEY"; // replace or override in .env

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.26",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: "zircuit",
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  networks: {
    zircuit: {
      url: "https://garfield-testnet.zircuit.com/",
      accounts: [deployerPrivateKey],
    },
  },
  etherscan: {
    enabled: false,
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
};

// Optional: Run generateTsAbis after deploy
task("deploy").setAction(async (args, hre, runSuper) => {
  await runSuper(args);
  await generateTsAbis(hre);
});

export default config;
