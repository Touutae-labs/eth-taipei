"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import DailySavingContractABI from "~~/abi/DailySavingContract.json";
import MyTokenABI from "~~/abi/MyToken.json";
import { notification } from "~~/utils/scaffold-eth";

// Contract addresses - replace with your deployed addresses
const DAILY_SAVING_CONTRACT_ADDRESS = "0x7f88a4818b03053cb04d984d4e9abe576afa10d0"; // Replace with your contract address

const Home = () => {
  const { address: connectedAddress } = useAccount();

  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("86400"); // Default: daily (86400 seconds)
  const [isCreating, setIsCreating] = useState(false);

  const [balance, setBalance] = useState("0");
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Common test tokens - update with tokens on your network
  const commonTokens = [
    { name: "ZRT", address: "0x4f0dfc7a638AA3f9b26F5aeA7f086526B269d53E" }, // Replace with your token address
  ];

  // Fetch balance of the selected token
  const fetchBalance = useCallback(
    async (tokenAddress: string) => {
      if (!connectedAddress) return;

      setIsLoadingBalance(true);

      try {
        // Get basic provider
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // Connect directly to the token contract
        const tokenContract = new ethers.Contract(tokenAddress, MyTokenABI.abi, signer);

        // Fetch balance
        const balanceWei = await tokenContract.balanceOf(connectedAddress);
        setBalance(balanceWei);
      } catch (error) {
        console.error("Error fetching balance:", error);
      } finally {
        setIsLoadingBalance(false);
      }
    },
    [connectedAddress],
  );

  useEffect(() => {
    if (token && connectedAddress) {
      fetchBalance(token);
    }
  }, [token, connectedAddress, fetchBalance]);

  const handleCreatePlan = async () => {
    if (!connectedAddress || !amount || !interval || !token) return;

    try {
      setIsCreating(true);

      // Get basic provider and signer
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Connect directly to contracts
      const tokenContract = new ethers.Contract(token, MyTokenABI.abi, signer);
      const savingsContract = new ethers.Contract(DAILY_SAVING_CONTRACT_ADDRESS, DailySavingContractABI.abi, signer);

      // Create permit parameters
      const amountWei = ethers.parseEther(amount);
      const intervalBigInt = BigInt(interval);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Get nonce for permit
      const nonce = await tokenContract.nonces(connectedAddress);
      const name = await tokenContract.name();
      const chainId = 48898;

      // Create EIP-712 signature
      const domain = {
        name: name,
        version: "1",
        chainId: chainId,
        verifyingContract: token,
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        owner: connectedAddress,
        spender: await savingsContract.getAddress(),
        value: amountWei,
        nonce: nonce,
        deadline: deadline,
      };

      // Sign permit
      const signature = await signer.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      // Send transaction directly
      const tx = await savingsContract.createPlanWithPermit(
        token,
        amountWei,
        intervalBigInt,
        deadline,
        sig.v,
        sig.r,
        sig.s,
      );

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt.hash);

      // Show notification
      notification.success("Your savings plan has been created");
      setAmount("");
    } catch (error) {
      console.error("Error:", error);
      notification.error("Failed to create savings plan");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <div className="flex items-center flex-col flex-grow pt-10">
        <div className="px-5 w-full max-w-lg">
          <h1 className="text-center">
            <span className="block text-2xl mb-2">Welcome to</span>
            <span className="block text-4xl font-bold">DailySavings</span>
          </h1>

          {connectedAddress ? (
            <>
              <div className="flex justify-center items-center space-x-2 flex-col mb-8">
                <p className="my-2 font-medium">Connected Address:</p>
                <div className="bg-base-300 px-4 py-1 rounded-full">{connectedAddress}</div>
              </div>

              <div className="bg-base-200 p-6 rounded-lg">
                <h2 className="text-xl font-bold mb-4">Create Savings Plan</h2>

                <div className="space-y-4">
                  {/* Token Selection */}
                  <div>
                    <label className="label">Token</label>
                    <select
                      className="select select-bordered w-full"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                    >
                      <option value="" disabled>
                        Select token
                      </option>
                      {commonTokens.map(t => (
                        <option key={t.address} value={t.address}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Balance Display */}
                  <div className="flex justify-between items-center">
                    <span className="label">Balance</span>
                    {isLoadingBalance ? (
                      <span className="loading loading-spinner loading-sm"></span>
                    ) : (
                      <span>{ethers.formatEther(balance)} ZRT</span>
                    )}
                  </div>

                  {/* Amount Input */}
                  <div>
                    <label className="label">Amount per interval</label>
                    <input
                      className="input input-bordered w-full"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.0"
                      type="number"
                      step="0.01"
                    />
                  </div>

                  {/* Interval Selection */}
                  <div>
                    <label className="label">Interval</label>
                    <select
                      className="select select-bordered w-full"
                      value={interval}
                      onChange={e => setInterval(e.target.value)}
                    >
                      <option value="10">10 Seconds</option>
                      <option value="86400">Daily</option>
                      <option value="604800">Weekly</option>
                      <option value="2592000">Monthly</option>
                    </select>
                  </div>

                  {/* Create Plan Button */}
                  <button
                    className="btn btn-primary w-full"
                    disabled={!token || !amount || !interval || isCreating}
                    onClick={handleCreatePlan}
                  >
                    {isCreating ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        Creating...
                      </>
                    ) : (
                      "Create Savings Plan"
                    )}
                  </button>
                </div>

                <div className="mt-4 text-sm opacity-70">
                  <p>
                    Note: Our relayer will automatically execute this plan at each interval. No additional transactions
                    needed!
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center mt-8">
              <p>Please connect your wallet to create savings plans</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Home;
