"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import DailySavingContractABI from "~~/abi/DailySavingContract.json";
import DailySavingKernelABI from "~~/abi/DailySavingKernel.json";
import MyTokenABI from "~~/abi/MyToken.json";
import { notification } from "~~/utils/scaffold-eth";

// Contract addresses
const DAILY_SAVING_CONTRACT_ADDRESS = "0xfbDEcD8c14E3AECB728C1B3944435cFF6FBdE84c";
const DAILY_SAVING_KERNEL_ADDRESS = "0x1a644410a489B9A05554c388e3c117Cd604808C9"; // Replace with real address

const Home = () => {
  const { address: connectedAddress } = useAccount();

  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("86400");
  const [isCreating, setIsCreating] = useState(false);
  const [balance, setBalance] = useState("0");
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [useSmartAccount, setUseSmartAccount] = useState(false);
  const [supportsEIP7702, setSupportsEIP7702] = useState(false);

  // Common test tokens
  const commonTokens = [{ name: "ZRT", address: "0x4f0dfc7a638AA3f9b26F5aeA7f086526B269d53E" }];

  // Check if wallet supports EIP-7702
  useEffect(() => {
    const checkEIP7702Support = async () => {
      if (!window.ethereum) return;

      try {
        // Request wallet_getCapabilities to check for EIP-7702 support
        const capabilities = await window.ethereum.request({
          method: "wallet_getCapabilities",
        });

        setSupportsEIP7702(capabilities && capabilities.includes && capabilities.includes("eth_sendTransaction7702"));
      } catch (error) {
        // If error, assume no support
        console.log("EIP-7702 not supported by this wallet", error);
        setSupportsEIP7702(false);
      }
    };

    checkEIP7702Support();
  }, []);

  // Fetch balance of the selected token
  const fetchBalance = useCallback(
    async (tokenAddress: string | ethers.Addressable) => {
      if (!connectedAddress) return;

      setIsLoadingBalance(true);

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const tokenContract = new ethers.Contract(tokenAddress, MyTokenABI.abi, signer);
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

  // Standard savings plan creation
  const handleDirectCreatePlan = async () => {
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

  // Smart Account flow with EIP-7702
  const handleSmartAccountCreatePlan = async () => {
    if (!connectedAddress || !amount || !interval || !token || !supportsEIP7702) return;

    try {
      setIsCreating(true);

      // Get basic provider and signer
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Connect to contracts
      const tokenContract = new ethers.Contract(token, MyTokenABI.abi, signer);
      const savingsContract = new ethers.Contract(DAILY_SAVING_CONTRACT_ADDRESS, DailySavingContractABI.abi, signer);
      const kernelContract = new ethers.Contract(DAILY_SAVING_KERNEL_ADDRESS, DailySavingKernelABI.abi, signer);

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
        spender: DAILY_SAVING_CONTRACT_ADDRESS,
        value: amountWei,
        nonce: nonce,
        deadline: deadline,
      };

      // Sign permit
      const signature = await signer.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      // Create calldata for the DailySavingContract
      const createPlanCalldata = savingsContract.interface.encodeFunctionData("createPlanWithPermit", [
        token,
        amountWei,
        intervalBigInt,
        deadline,
        sig.v,
        sig.r,
        sig.s,
      ]);

      // Create calldata for the kernel's executeBatch function
      const kernelCalldata = kernelContract.interface.encodeFunctionData("executeBatch", [
        DAILY_SAVING_CONTRACT_ADDRESS,
        [createPlanCalldata],
      ]);

      // Prepare EIP-7702 transaction
      const transaction = {
        to: DAILY_SAVING_KERNEL_ADDRESS,
        data: kernelCalldata,
        value: "0x0",
        // EIP-7702 specific fields
        typeTransaction: {
          delegatecall: true,
        },
      };

      // Send EIP-7702 transaction
      const txHash = await window.ethereum.request({
        method: "eth_sendTypeTransaction",
        params: [
          {
            ...transaction,
            from: connectedAddress,
            gas: "0x7A120", // Gas limit
          },
          "delegatecall", // Transaction type
        ],
      });

      console.log("Type transaction submitted:", txHash);
      notification.success("Smart account transaction submitted!");

      // Wait for transaction receipt
      let receipt = null;
      while (!receipt) {
        try {
          receipt = await provider.getTransactionReceipt(txHash);
          if (receipt) {
            console.log("Transaction confirmed:", receipt);
            notification.success("Your savings plan has been created via smart account");
            setAmount("");
            break;
          }
        } catch (e) {
          console.log("Waiting for confirmation...", e);
        }

        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error("Error with smart account transaction:", error);
      notification.error("Failed to create savings plan with smart account");
    } finally {
      setIsCreating(false);
    }
  };

  // Choose which function to use based on user selection
  const handleCreatePlan = async () => {
    if (useSmartAccount && supportsEIP7702) {
      await handleSmartAccountCreatePlan();
    } else {
      await handleDirectCreatePlan();
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

              {/* Smart Account Toggle */}
              {supportsEIP7702 && (
                <div className="form-control mb-4">
                  <label className="label cursor-pointer justify-between">
                    <span className="label-text">Use Smart Account (EIP-7702)</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary"
                      checked={useSmartAccount}
                      onChange={e => setUseSmartAccount(e.target.checked)}
                    />
                  </label>
                </div>
              )}

              {useSmartAccount && !supportsEIP7702 && (
                <div className="alert alert-warning mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>Your wallet doesn&apos;t support EIP-7702. Using direct transactions instead.</span>
                </div>
              )}

              <div className="bg-base-200 p-6 rounded-lg">
                <h2 className="text-xl font-bold mb-4">
                  Create Savings Plan
                  {useSmartAccount && supportsEIP7702 && (
                    <span className="badge badge-primary ml-2">Smart Account</span>
                  )}
                </h2>

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
                    className={`btn w-full ${useSmartAccount && supportsEIP7702 ? "btn-secondary" : "btn-primary"}`}
                    disabled={!token || !amount || !interval || isCreating}
                    onClick={handleCreatePlan}
                  >
                    {isCreating ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        Creating...
                      </>
                    ) : useSmartAccount && supportsEIP7702 ? (
                      "Create Plan via Smart Account"
                    ) : (
                      "Create Savings Plan"
                    )}
                  </button>
                </div>

                {useSmartAccount && supportsEIP7702 && (
                  <div className="alert alert-info mt-4 text-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      className="stroke-current shrink-0 w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>
                    </svg>
                    <span>Smart Account mode uses EIP-7702 type transactions with delegatecall.</span>
                  </div>
                )}

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
