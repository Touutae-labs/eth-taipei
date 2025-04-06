# DailySavings: Automated Yield-Bearing Savings Protocol

🌟 Overview
DailySavings is a next-generation decentralized savings protocol developed for ETH Taipei Hackathon that enables users to create automated savings plans with reward incentives. The protocol leverages EIP-2612 permits for gasless approvals and uses a relayer system to automatically execute savings transfers at specified intervals.

✨ Key Features
Automated Savings Plans: Users can create recurring savings plans that execute automatically
Yield-Bearing: Savers earn ZRT (Zircuit Reward Tokens) as incentives based on configurable yield rates
Gasless Setup: Uses EIP-2612 permits for gasless token approvals
Multiple Intervals: Support for daily, weekly, monthly, or custom time intervals
Zero Maintenance: After setup, the relayer handles all execution automatically
Multiple Token Support: Configurable support for various ERC2 and Get Pay as My Token
Relayer Infrastructure: Reliable execution through our decentralized relayer networ

⚙️ How It Works
Creating a Savings Plan
Connect Wallet: Connect your Ethereum wallet to the app
Select Token: Choose which token you want to save
Set Parameters: Define amount and interval (daily, weekly, monthly)
Sign Permit: Sign an EIP-2612 permit (no transaction needed)
Submit Plan: Create your plan with a single transaction

Behind the Scenes
Plan Registration: Your plan is stored on-chain with unique identifier
Relayer Monitoring: Our relayer service monitors for plan execution times
Automatic Execution: When your interval is reached:
Tokens are transferred from your wallet to the savings contract
ZRT reward tokens are minted based on your savings amount and duration
Yield Distribution: Rewards are automatically sent to your wallet
Smart Account Integration
For users with smart contract accounts:

Sign with EOA: Sign the permit with your EOA
Execute via Smart Account: The transaction is executed through your smart account
Funds Flow: Tokens flow from your smart account, not your EOA



Contracts:
DailySavingContract: 0x7f88a4818b03053cb04d984d4e9abe576afa10d0
ZRT Token: 0x4f0dfc7a638AA3f9b26F5aeA7f086526B269d53E
Network: Zircuit Mainnet

Video To Demo https://youtu.be/17Hvky8uiKo

