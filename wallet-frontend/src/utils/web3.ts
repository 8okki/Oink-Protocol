import { ethers } from "ethers";
import { createSmartAccountClient } from "@biconomy/account";

const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const ARC_USDC_CONTRACT = "0x3600000000000000000000000000000000000000"; // Native Arc Testnet USDC (ERC-20 interface)

export interface WalletDetails {
  privateKey: string;
  signerAddress: string;
  smartAccountAddress: string;
  isSimulated: boolean;
}

// Generate or retrieve stored EOA private key
export function getOrCreateEOA(): string {
  let pkey = localStorage.getItem("oink_eoa_private_key");
  if (!pkey) {
    const randomWallet = ethers.Wallet.createRandom();
    pkey = randomWallet.privateKey;
    localStorage.setItem("oink_eoa_private_key", pkey);
  }
  return pkey;
}

// Reset the EOA wallet to generate a new one
export function resetEOA(): string {
  const randomWallet = ethers.Wallet.createRandom();
  localStorage.setItem("oink_eoa_private_key", randomWallet.privateKey);
  return randomWallet.privateKey;
}

// Initialize Biconomy Smart Account
export async function initBiconomyAccount(privateKey: string): Promise<WalletDetails> {
  try {
    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC);
    const signer = new ethers.Wallet(privateKey, provider);
    
    // We use a custom bundler URL targeting Arc Testnet (Chain ID 5042002) for Biconomy setup.
    const bundlerUrl = "https://bundler.biconomy.io/api/v2/5042002/nPt4VTZQ6.5e9f1222-30d8-4f8b-b78f-6b22b10a26d7";

    const smartAccountClient = await createSmartAccountClient({
      signer,
      bundlerUrl,
      rpcUrl: ARC_TESTNET_RPC,
    });

    const smartAccountAddress = await smartAccountClient.getAccountAddress();

    return {
      privateKey,
      signerAddress: signer.address,
      smartAccountAddress,
      isSimulated: false,
    };
  } catch (error) {
    console.warn("Failed to initialize on-chain Biconomy Smart Account, falling back to simulation:", error);
    
    // Graceful fallback for mock/offline demo
    const tempSigner = new ethers.Wallet(privateKey);
    // Derive a simulated deterministic smart account address from the EOA
    const mockSmartAccountAddress = ethers.getCreateAddress({
      from: tempSigner.address,
      nonce: 0,
    });
    
    return {
      privateKey,
      signerAddress: tempSigner.address,
      smartAccountAddress: mockSmartAccountAddress,
      isSimulated: true,
    };
  }
}

// Fetch balances (on-chain with local storage overrides for mock USDC transactions)
export async function fetchBalances(
  smartAccountAddress: string,
  isSimulated: boolean
): Promise<{ eth: string; usdc: string }> {
  if (isSimulated) {
    // Return mock values stored or defaults
    const mockEth = localStorage.getItem("oink_mock_eth") || "0.025";
    const mockUsdc = localStorage.getItem("oink_mock_usdc") || "100.00";
    return { eth: mockEth, usdc: mockUsdc };
  }

  try {
    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC);
    
    // Fetch ETH (native gas USDC) balance
    const ethBalanceRaw = await provider.getBalance(smartAccountAddress);
    const ethBalance = parseFloat(ethers.formatEther(ethBalanceRaw)).toFixed(4);

    // Fetch USDC balance (ERC-20 standard interface with 6 decimals)
    let usdcBalance = "0.00";
    try {
      const usdcAbi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
      const usdcContract = new ethers.Contract(ARC_USDC_CONTRACT, usdcAbi, provider);
      const usdcBalanceRaw = await usdcContract.balanceOf(smartAccountAddress);
      usdcBalance = parseFloat(ethers.formatUnits(usdcBalanceRaw, 6)).toFixed(2);
    } catch {
      // Fallback to local storage for USDC if token fetch fails
      usdcBalance = localStorage.getItem("oink_mock_usdc") || "100.00";
    }

    return { eth: ethBalance, usdc: usdcBalance };
  } catch (error) {
    console.error("Error fetching balances from blockchain:", error);
    // Return standard mock values on error
    const mockEth = localStorage.getItem("oink_mock_eth") || "0.025";
    const mockUsdc = localStorage.getItem("oink_mock_usdc") || "100.00";
    return { eth: mockEth, usdc: mockUsdc };
  }
}

// Helper to calculate round-up based on policy
export function calculateRoundUp(amount: number, policy: string): { total: number; roundup: number } {
  if (amount <= 0) return { total: 0, roundup: 0 };
  
  let total = amount;
  let roundup = 0;

  if (policy === "nearest-1") {
    // Round to nearest whole dollar. If already whole, round to next whole dollar
    total = Math.floor(amount) + 1;
    roundup = total - amount;
  } else if (policy === "nearest-5") {
    // Round to next multiple of 5
    total = Math.floor(amount / 5) * 5 + 5;
    roundup = total - amount;
  } else if (policy === "nearest-10") {
    // Round to next multiple of 10
    total = Math.floor(amount / 10) * 10 + 10;
    roundup = total - amount;
  } else if (policy === "fixed-0.5") {
    roundup = 0.50;
    total = amount + roundup;
  } else if (policy === "fixed-1") {
    roundup = 1.00;
    total = amount + roundup;
  }

  // Round values to 2 decimal places to avoid floating point issues
  total = Math.round(total * 100) / 100;
  roundup = Math.round(roundup * 100) / 100;

  return { total, roundup };
}
