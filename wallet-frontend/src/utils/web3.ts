import { ethers } from "ethers";
import { createSmartAccountClient } from "@biconomy/account";

const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const ARC_USDC_CONTRACT = "0x3600000000000000000000000000000000000000"; // Native Arc Testnet USDC (ERC-20 interface)
const DEPLOYED_OINK_SMART_ACCOUNT = "0x1Ae81be0ac0b2CD93e78E3ba05654196144C9661";
const DEPLOYER_EOA_ADDRESS = "0x4636b45ac382f5429b36f5d7b7ba8fe2b7406d2f";
const DEPLOYED_OINK_VAULT = "0x18A49aEF7e31ea27E727025185F12FF0633cd6Db";

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
    // Default to the user's deployed address configuration
    pkey = "default";
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
  // If no private key has been imported yet, default to showing the actual EOA and contract addresses
  if (privateKey === "default") {
    return {
      privateKey: "default",
      signerAddress: DEPLOYER_EOA_ADDRESS,
      smartAccountAddress: DEPLOYED_OINK_SMART_ACCOUNT,
      isSimulated: false, // Set to false to allow on-chain balance fetching
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC);
    const signer = new ethers.Wallet(privateKey, provider);
    
    // If it's the deployer EOA, link directly to the deployed OinkSmartAccount on Arc
    if (signer.address.toLowerCase() === DEPLOYER_EOA_ADDRESS.toLowerCase()) {
      return {
        privateKey,
        signerAddress: signer.address,
        smartAccountAddress: DEPLOYED_OINK_SMART_ACCOUNT,
        isSimulated: false,
      };
    }

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
    
    // Even in simulation fallback, if the key belongs to the deployer, map it to the deployed contract
    if (tempSigner.address.toLowerCase() === DEPLOYER_EOA_ADDRESS.toLowerCase()) {
      return {
        privateKey,
        signerAddress: tempSigner.address,
        smartAccountAddress: DEPLOYED_OINK_SMART_ACCOUNT,
        isSimulated: false, // Set to false to allow querying balances of the deployed contract on-chain
      };
    }

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
  signerAddress: string,
  isSimulated: boolean
): Promise<{ eth: string; usdc: string; eoaUsdc: string; vaultUsdc: string; vaultShares: string }> {
  if (isSimulated) {
    // Return mock values stored or defaults
    const mockEth = localStorage.getItem("oink_mock_eth") || "0.025";
    const mockUsdc = localStorage.getItem("oink_mock_usdc") || "0.00";
    const mockEoaUsdc = localStorage.getItem("oink_mock_eoa_usdc") || "20.00";
    const mockVaultUsdc = localStorage.getItem("oink_vault_balance") || "24.50";
    const mockVaultShares = localStorage.getItem("oink_vault_shares") || "24.50";
    return {
      eth: mockEth,
      usdc: mockUsdc,
      eoaUsdc: mockEoaUsdc,
      vaultUsdc: mockVaultUsdc,
      vaultShares: mockVaultShares,
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC);
    
    // Fetch ETH (native gas USDC) balance of the Smart Account
    const ethBalanceRaw = await provider.getBalance(smartAccountAddress);
    const ethBalance = parseFloat(ethers.formatEther(ethBalanceRaw)).toFixed(4);

    // Fetch USDC balances (ERC-20 standard interface with 6 decimals)
    let usdcBalance = "0.00";
    let eoaUsdcBalance = "0.00";
    let vaultUsdcBalance = "0.00";
    let vaultSharesBalance = "0.00";
    
    const usdcAbi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
    const usdcContract = new ethers.Contract(ARC_USDC_CONTRACT, usdcAbi, provider);
    
    try {
      const usdcBalanceRaw = await usdcContract.balanceOf(smartAccountAddress);
      usdcBalance = parseFloat(ethers.formatUnits(usdcBalanceRaw, 6)).toFixed(2);
    } catch (err) {
      console.warn("Failed to fetch Smart Account USDC balance:", err);
      usdcBalance = localStorage.getItem("oink_mock_usdc") || "0.00";
    }

    if (signerAddress) {
      try {
        const eoaUsdcBalanceRaw = await usdcContract.balanceOf(signerAddress);
        eoaUsdcBalance = parseFloat(ethers.formatUnits(eoaUsdcBalanceRaw, 6)).toFixed(2);
      } catch (err) {
        console.warn("Failed to fetch EOA USDC balance:", err);
        eoaUsdcBalance = localStorage.getItem("oink_mock_eoa_usdc") || "20.00";
      }
    }

    // Fetch ybOINK (OinkVault) shares and convert to USDC assets
    try {
      const vaultAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function convertToAssets(uint256) view returns (uint256)"
      ];
      const vaultContract = new ethers.Contract(DEPLOYED_OINK_VAULT, vaultAbi, provider);
      const shares = await vaultContract.balanceOf(smartAccountAddress);
      vaultSharesBalance = parseFloat(ethers.formatUnits(shares, 6)).toFixed(2);

      const assets = await vaultContract.convertToAssets(shares);
      vaultUsdcBalance = parseFloat(ethers.formatUnits(assets, 6)).toFixed(2);
    } catch (err) {
      console.warn("Failed to fetch OinkVault balance from blockchain:", err);
      vaultSharesBalance = localStorage.getItem("oink_vault_shares") || "0.00";
      vaultUsdcBalance = localStorage.getItem("oink_vault_balance") || "0.00";
    }

    return {
      eth: ethBalance,
      usdc: usdcBalance,
      eoaUsdc: eoaUsdcBalance,
      vaultUsdc: vaultUsdcBalance,
      vaultShares: vaultSharesBalance,
    };
  } catch (error) {
    console.error("Error fetching balances from blockchain:", error);
    // Return standard mock values on error
    const mockEth = localStorage.getItem("oink_mock_eth") || "0.025";
    const mockUsdc = localStorage.getItem("oink_mock_usdc") || "0.00";
    const mockEoaUsdc = localStorage.getItem("oink_mock_eoa_usdc") || "20.00";
    const mockVaultUsdc = localStorage.getItem("oink_vault_balance") || "0.00";
    const mockVaultShares = localStorage.getItem("oink_vault_shares") || "0.00";
    return {
      eth: mockEth,
      usdc: mockUsdc,
      eoaUsdc: mockEoaUsdc,
      vaultUsdc: mockVaultUsdc,
      vaultShares: mockVaultShares,
    };
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

// Execute on-chain split payment via OinkSmartAccount
export async function executeOinkPayment(
  privateKey: string,
  smartAccountAddress: string,
  merchantAddress: string,
  price: number,
  roundup: number,
  vaultAddress: string
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC);
  const signer = new ethers.Wallet(privateKey, provider);

  const usdcAbi = [
    "function transfer(address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
  ];
  const usdcContract = new ethers.Contract(ARC_USDC_CONTRACT, usdcAbi, signer);

  const smartAccountAbi = [
    "function execute(address,uint256,bytes) external payable",
    "function oinkEnabled() view returns (bool)",
    "function oinkVault() view returns (address)",
    "function setOinkVault(address) external",
    "function setOinkEnabled(bool) external",
    "function setRoundingPolicy(uint8) external"
  ];
  const smartAccountContract = new ethers.Contract(smartAccountAddress, smartAccountAbi, signer);

  const priceRaw = ethers.parseUnits(price.toFixed(2), 6);
  const roundupRaw = ethers.parseUnits(roundup.toFixed(2), 6);
  const totalRaw = priceRaw + roundupRaw;

  // 1. Verify EOA has enough USDC balance
  const eoaBalance = await usdcContract.balanceOf(signer.address);
  if (eoaBalance < totalRaw) {
    throw new Error(`Insufficient EOA USDC balance. EOA has ${ethers.formatUnits(eoaBalance, 6)} USDC, but transaction requires ${price + roundup} USDC.`);
  }

  // 2. Ensure Smart Account configuration is correct on-chain
  try {
    const isEnabled = await smartAccountContract.oinkEnabled();
    const currentVault = await smartAccountContract.oinkVault();
    const shouldBeEnabled = roundup > 0;
    
    if (isEnabled !== shouldBeEnabled || (shouldBeEnabled && currentVault.toLowerCase() !== vaultAddress.toLowerCase())) {
      console.log(`Configuring Smart Account on-chain (shouldBeEnabled: ${shouldBeEnabled})...`);
      if (shouldBeEnabled && currentVault.toLowerCase() !== vaultAddress.toLowerCase()) {
        const txVault = await smartAccountContract.setOinkVault(vaultAddress);
        await txVault.wait();
      }
      if (isEnabled !== shouldBeEnabled) {
        const txEnabled = await smartAccountContract.setOinkEnabled(shouldBeEnabled);
        await txEnabled.wait();
      }
    }
  } catch (err) {
    console.warn("Failed to verify/configure smart account state on-chain:", err);
  }

  // 3. Transfer total USDC from EOA to Smart Account (just-in-time funding)
  console.log(`Funding Smart Account with ${price + roundup} USDC...`);
  const fundTx = await usdcContract.transfer(smartAccountAddress, totalRaw);
  await fundTx.wait();

  // 4. Execute transfer from Smart Account to Merchant (intercepted for round-up)
  console.log("Executing payment via Smart Account...");
  const usdcInterface = new ethers.Interface(usdcAbi);
  const transferCalldata = usdcInterface.encodeFunctionData("transfer", [merchantAddress, priceRaw]);
  
  const execTx = await smartAccountContract.execute(ARC_USDC_CONTRACT, 0, transferCalldata);
  const receipt = await execTx.wait();

  return receipt.hash;
}

// Execute on-chain withdrawal from OinkVault back to EOA
export async function executeOinkWithdraw(
  privateKey: string,
  smartAccountAddress: string,
  vaultAddress: string,
  amount: number
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC);
  const signer = new ethers.Wallet(privateKey, provider);

  const smartAccountAbi = [
    "function execute(address,uint256,bytes) external payable"
  ];
  const smartAccountContract = new ethers.Contract(smartAccountAddress, smartAccountAbi, signer);

  // We convert the USDC amount to 6 decimals
  const assetsRaw = ethers.parseUnits(amount.toFixed(2), 6);

  // Encode the withdraw(uint256 assets, address receiver, address owner) call
  const vaultInterface = new ethers.Interface([
    "function withdraw(uint256,address,address) returns (uint256)"
  ]);
  const withdrawCalldata = vaultInterface.encodeFunctionData("withdraw", [
    assetsRaw,
    signer.address, // receiver EOA
    smartAccountAddress // owner of shares
  ]);

  console.log(`Withdrawing ${amount} USDC from OinkVault...`);
  const execTx = await smartAccountContract.execute(vaultAddress, 0, withdrawCalldata);
  const receipt = await execTx.wait();

  return receipt.hash;
}

// Query on-chain vault to preview the shares to burn for a given USDC amount
export async function previewWithdrawShares(
  vaultAddress: string,
  amount: number
): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC);
    const vaultAbi = ["function previewWithdraw(uint256) view returns (uint256)"];
    const vaultContract = new ethers.Contract(vaultAddress, vaultAbi, provider);
    const assetsRaw = ethers.parseUnits(amount.toFixed(2), 6);
    const sharesRaw = await vaultContract.previewWithdraw(assetsRaw);
    return parseFloat(ethers.formatUnits(sharesRaw, 6)).toFixed(2);
  } catch (err) {
    console.warn("Failed to preview withdraw shares from contract:", err);
    return amount.toFixed(2); // Fallback to 1:1 peg
  }
}
