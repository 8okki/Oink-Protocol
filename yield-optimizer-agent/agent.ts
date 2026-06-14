import * as dotenv from 'dotenv';
import * as path from 'path';
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Define custom chain for Arc Testnet
const arcTestnet = defineChain({
  id: 49443,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.SOURCE_RPC_URL || 'https://rpc.testnet.arc.network'] },
  },
});

// Spoke ABI for MockAaveV4Spoke
const spokeAbi = [
  {
    "inputs": [],
    "name": "supplyAPY",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Mini ABI for OinkVault
const oinkVaultAbi = [
  {
    "inputs": [
      { "internalType": "address", "name": "_pool", "type": "address" },
      { "internalType": "uint256", "name": "_amount", "type": "uint256" }
    ],
    "name": "invest",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "name": "activeProtocols",
    "outputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "name": "protocolReceiptToken",
    "outputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Mini ABI for standard ERC20
const erc20Abi = [
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Constants & Env Configuration
const RAY = 10n ** 27n;
const USD_DECIMALS = 6;

const ALLOCATOR_PK = process.env.ALLOCATOR_PRIVATE_KEY as `0x${string}`;
const OINK_VAULT_ADDRESS = (process.env.OINK_VAULT_ADDRESS || '0x2D7d05f5992A9AB1CbA95DAd6A130e7E77C32FF0') as `0x${string}`;
const USDC_ADDRESS = (process.env.USDC_ADDRESS || '0x3600000000000000000000000000000000000000') as `0x${string}`;

// Parse candidate pools array
const CANDIDATE_POOLS = (process.env.CANDIDATE_POOLS || '')
  .split(',')
  .map(p => p.trim())
  .filter(p => p !== '');

const NET_PROFIT_THRESHOLD = parseFloat(process.env.NET_PROFIT_THRESHOLD || '5.0');
const PROJECTED_DAYS = parseInt(process.env.PROJECTED_DAYS || '30', 10);
const PRINCIPAL_AMOUNT = parseFloat(process.env.PRINCIPAL_AMOUNT || '10000');
const POLLING_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_SECONDS || '300', 10) * 1000;

// Setup clients
const sourcePublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.SOURCE_RPC_URL || 'https://rpc.testnet.arc.network'),
});

const destPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.DESTINATION_RPC_URL || 'https://rpc.testnet.arc.network'),
});

const account = ALLOCATOR_PK ? privateKeyToAccount(ALLOCATOR_PK) : null;
const sourceWalletClient = account
  ? createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(process.env.SOURCE_RPC_URL || 'https://rpc.testnet.arc.network'),
    })
  : null;

// =============================================================================
// AI Agent On-Chain & Calculation Tool Implementations
// =============================================================================

/**
 * Tool: Fetch yields for a list of candidate pools.
 * If live calls fail or are mock addresses, returns simulation fallbacks.
 */
async function toolFetchYields(poolAddresses: string[]) {
  console.log(`[Tool Call] Fetching yield rates for pools:`, poolAddresses);
  const results: { poolAddress: string; yieldPercent: number; isMock: boolean }[] = [];

  for (let i = 0; i < poolAddresses.length; i++) {
    const pool = poolAddresses[i];
    if (!pool || pool === '0x0000000000000000000000000000000000000000') {
      continue;
    }

    try {
      const supplyApyBps = await sourcePublicClient.readContract({
        address: pool as `0x${string}`,
        abi: spokeAbi,
        functionName: 'supplyAPY',
      });
      const yieldPercent = Number(supplyApyBps) / 10000;
      results.push({
        poolAddress: pool,
        yieldPercent,
        isMock: false,
      });
      console.log(`  Pool ${pool} yield: ${(yieldPercent * 100).toFixed(2)}% (from chain)`);
    } catch (err: any) {
      console.error(`  Failed to query yield from spoke ${pool}:`, err.message || err);
      // Fallback if network call fails
      const mockRates = [0.032, 0.045, 0.058];
      results.push({
        poolAddress: pool,
        yieldPercent: mockRates[i % mockRates.length],
        isMock: true,
      });
    }
  }
  return { yields: results };
}

/**
 * Tool: Query vault state to find active deposits and idle USDC.
 */
async function toolGetCurrentVaultAllocation() {
  console.log(`[Tool Call] Querying OinkVault state dynamically...`);
  const activeProtocols: string[] = [];
  let index = 0;

  // 1. Scan for active protocols
  while (true) {
    try {
      const protocol = await sourcePublicClient.readContract({
        address: OINK_VAULT_ADDRESS,
        abi: oinkVaultAbi,
        functionName: 'activeProtocols',
        args: [BigInt(index)],
      });
      activeProtocols.push(protocol);
      index++;
    } catch {
      break; // Index out of bounds, finish loop
    }
  }

  const allocations: { pool: string; balanceUsdc: number; isMock: boolean }[] = [];

  // 2. Fetch balances for active protocols
  for (const pool of activeProtocols) {
    try {
      const receiptToken = await sourcePublicClient.readContract({
        address: OINK_VAULT_ADDRESS,
        abi: oinkVaultAbi,
        functionName: 'protocolReceiptToken',
        args: [pool as `0x${string}`],
      });

      const shareBalance = await sourcePublicClient.readContract({
        address: receiptToken as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [OINK_VAULT_ADDRESS],
      });

      let usdcValue = shareBalance;
      // Optional ERC-4626 convertToAssets lookup
      try {
        usdcValue = await sourcePublicClient.readContract({
          address: pool as `0x${string}`,
          abi: [
            {
              "inputs": [{ "internalType": "uint256", "name": "shares", "type": "uint256" }],
              "name": "convertToAssets",
              "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
              "stateMutability": "view",
              "type": "function"
            }
          ],
          functionName: 'convertToAssets',
          args: [shareBalance],
        });
      } catch {}

      allocations.push({
        pool,
        balanceUsdc: Number(formatUnits(usdcValue, USD_DECIMALS)),
        isMock: false,
      });
    } catch {
      // Fallback mock allocation for demo if reads fail
      allocations.push({
        pool,
        balanceUsdc: PRINCIPAL_AMOUNT,
        isMock: true,
      });
    }
  }

  // If no allocations were returned (contract returned empty), provide a mock active allocation
  // so the agent always has a "Source" to optimize from during the hackathon
  if (allocations.length === 0) {
    allocations.push({
      pool: '0x1111111111111111111111111111111111111111',
      balanceUsdc: PRINCIPAL_AMOUNT,
      isMock: true,
    });
  }

  // 3. Query idle USDC balance
  let idleUsdc = 0;
  try {
    const idleRaw = await sourcePublicClient.readContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [OINK_VAULT_ADDRESS],
    });
    idleUsdc = Number(formatUnits(idleRaw, USD_DECIMALS));
  } catch {
    idleUsdc = 250.00; // Mock idle USDC
  }

  return { idleUsdc, allocations };
}

/**
 * Tool: Estimate gas/bridge costs.
 */
async function toolEstimateCosts() {
  console.log(`[Tool Call] Estimating transaction costs...`);
  try {
    const gasPrice = await sourcePublicClient.getGasPrice();
    const estimatedGas = 450000n;
    const costUsdc = parseFloat(formatUnits(gasPrice * estimatedGas, 18)) * 1.5;
    return { estimatedCost: costUsdc > 0 ? costUsdc : 1.25 };
  } catch {
    return { estimatedCost: 1.25 };
  }
}

/**
 * Tool: Submit the OinkVault investment transaction.
 */
async function toolExecuteRebalance(amount: number, targetPoolAddress: string) {
  console.log(`[Tool Call] Executing on-chain rebalance to target: ${targetPoolAddress}...`);
  if (!account || !sourceWalletClient) {
    throw new Error("Allocator account is not initialized.");
  }

  try {
    // 1. Scan for active protocols to withdraw from first
    const activeProtocols: string[] = [];
    let index = 0;
    while (true) {
      try {
        const protocol = await sourcePublicClient.readContract({
          address: OINK_VAULT_ADDRESS,
          abi: oinkVaultAbi,
          functionName: 'activeProtocols',
          args: [BigInt(index)],
        });
        activeProtocols.push(protocol.toLowerCase());
        index++;
      } catch {
        break; // Out of bounds
      }
    }

    const targetLower = targetPoolAddress.toLowerCase();

    // 2. Withdraw from any active protocol that is NOT the target pool
    for (const pool of activeProtocols) {
      if (pool !== targetLower) {
        const receiptToken = await sourcePublicClient.readContract({
          address: OINK_VAULT_ADDRESS,
          abi: oinkVaultAbi,
          functionName: 'protocolReceiptToken',
          args: [pool as `0x${string}`],
        });

        const shareBalance = await sourcePublicClient.readContract({
          address: receiptToken as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [OINK_VAULT_ADDRESS],
        });

        if (shareBalance > 0n) {
          let withdrawAmount = shareBalance;
          try {
            withdrawAmount = await sourcePublicClient.readContract({
              address: pool as `0x${string}`,
              abi: [
                {
                  "inputs": [{ "internalType": "uint256", "name": "shares", "type": "uint256" }],
                  "name": "convertToAssets",
                  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
                  "stateMutability": "view",
                  "type": "function"
                }
              ],
              functionName: 'convertToAssets',
              args: [shareBalance],
            });
          } catch {}

          // Skip if the amount is less than 0.01 USDC (10000 Wei)
          if (withdrawAmount < 10000n) {
            console.log(`  Skipping withdrawal from ${pool} as the balance is negligible: ${formatUnits(withdrawAmount, USD_DECIMALS)} USDC`);
            continue;
          }

          console.log(`  Withdrawing ${formatUnits(withdrawAmount, USD_DECIMALS)} USDC from old pool: ${pool}...`);
          
          try {
            const withdrawTx = await sourceWalletClient.writeContract({
              address: OINK_VAULT_ADDRESS,
              abi: [
                {
                  "inputs": [
                    { "internalType": "address", "name": "_pool", "type": "address" },
                    { "internalType": "uint256", "name": "_amount", "type": "uint256" }
                  ],
                  "name": "withdrawFromProtocol",
                  "outputs": [],
                  "stateMutability": "nonpayable",
                  "type": "function"
                }
              ],
              functionName: 'withdrawFromProtocol',
              args: [pool as `0x${string}`, withdrawAmount],
            });
            
            await sourcePublicClient.waitForTransactionReceipt({ hash: withdrawTx });
            console.log(`  Successfully withdrew from ${pool}. Tx: ${withdrawTx}`);
          } catch (err: any) {
            console.warn(`  Warning: Failed to withdraw from old pool ${pool}:`, err.message || err);
          }
        }
      }
    }

    // 3. Deposit/invest the target amount into the target pool (clamped to available idle balance)
    const idleRaw = await sourcePublicClient.readContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [OINK_VAULT_ADDRESS],
    });

    let rebalanceAmount = parseUnits(amount.toString(), USD_DECIMALS);
    if (rebalanceAmount > idleRaw) {
      console.log(`  Clamping rebalance amount from ${amount} to available idle balance: ${formatUnits(idleRaw, USD_DECIMALS)}`);
      rebalanceAmount = idleRaw;
    }

    if (rebalanceAmount === 0n) {
      console.log("  No idle USDC to invest in target pool.");
      return { success: true, message: "No funds available to allocate.", isMock: false };
    }

    console.log(`  Investing ${formatUnits(rebalanceAmount, USD_DECIMALS)} USDC into target pool: ${targetPoolAddress}...`);
    const txHash = await sourceWalletClient.writeContract({
      address: OINK_VAULT_ADDRESS,
      abi: oinkVaultAbi,
      functionName: 'invest',
      args: [targetPoolAddress as `0x${string}`, rebalanceAmount],
    });

    await sourcePublicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`  Successfully invested in ${targetPoolAddress}. Tx: ${txHash}`);

    return { success: true, txHash, isMock: false };
  } catch (error: any) {
    console.error("  Rebalance failed:", error);
    return {
      success: false,
      reason: error.message || error,
      isMock: false
    };
  }
}

// =============================================================================
// Gemini Function Declarations (Tools Specification)
// =============================================================================

const fetchYieldsSpec = {
  name: 'fetchYields',
  description: 'Fetches the current yield rates (APY) for USDC from the specified Aave V4 pools.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      poolAddresses: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: 'The array of Aave V4 pool/spoke addresses to query APY for.'
      }
    },
    required: ['poolAddresses'],
  },
};

const getCurrentVaultAllocationSpec = {
  name: 'getCurrentVaultAllocation',
  description: 'Queries OinkVault on-chain to retrieve its current idle USDC balance and active yield pool allocations.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

const estimateCostsSpec = {
  name: 'estimateCosts',
  description: 'Estimates the combined gas and bridge costs in USDC to execute a reallocation.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

const executeRebalanceSpec = {
  name: 'executeRebalance',
  description: 'Calls the OinkVault contract to transfer USDC to the destination yield pool.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      amount: { type: SchemaType.NUMBER, description: 'USDC principal to invest.' },
      targetPoolAddress: { type: SchemaType.STRING, description: 'The target pool address.' },
    },
    required: ['amount', 'targetPoolAddress'],
  },
};

// =============================================================================
// LLM Agent Execution Flow
// =============================================================================

async function runGenerativeAgent() {
  console.log(`\n==================================================`);
  console.log(`[${new Date().toLocaleTimeString()}] Starting Gemini AI Allocator Agent`);
  console.log(`==================================================`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    console.error("❌ Error: GEMINI_API_KEY is not configured in .env");
    return;
  }

  console.log(`[Agent Status] Connected to Live Google Gemini API...`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite',
    systemInstruction: `You are the Oink Yield Optimizer AI Agent.
Your role is to optimize yield for users by moving USDC to the highest yield-bearing Aave V4 pool.
You must use your tools sequentially:
1. Call getCurrentVaultAllocation() to fetch the vault's current idle USDC and active pool allocations.
2. Call fetchYields() passing all candidate pools: [${CANDIDATE_POOLS.join(', ')}] AND any active pools found in the vault.
3. Call estimateCosts() to estimate fees.
4. Calculate the Net Profit mathematically in your reasoning:
   Net Profit = (Highest APY Candidate - Current APY Source) * Principal * (Projected Days / 365) - Estimated Cost.
   Use the actual principal amount (the idle USDC if allocating new funds, or the active pool balance if reallocating) returned by getCurrentVaultAllocation() as the Principal.
   The investment horizon is ${PROJECTED_DAYS} days.
5. If the calculated Net Profit is greater than or equal to the threshold (${NET_PROFIT_THRESHOLD} USDC), call executeRebalance() with the target pool and the principal amount to allocate.
6. Provide a very brief summary of your reasoning and final decision. Avoid long-winded explanations.`,
    tools: [{
      functionDeclarations: [
        getCurrentVaultAllocationSpec,
        fetchYieldsSpec,
        estimateCostsSpec,
        executeRebalanceSpec
      ]
    }]
  });

  try {
    const chat = model.startChat();
    let response = await chat.sendMessage(`Optimize yields. Inspect vault state, fetch yields, and evaluate rebalance now.`);
    
    // Process function/tool calls returned by Gemini
    let functionCalls = response.response.functionCalls();
    
    while (functionCalls && functionCalls.length > 0) {
      const parts: any[] = [];
      for (const call of functionCalls) {
        const { name, args } = call;
        let toolResult: any;

        if (name === 'getCurrentVaultAllocation') {
          toolResult = await toolGetCurrentVaultAllocation();
        } else if (name === 'fetchYields') {
          const params = args as any;
          toolResult = await toolFetchYields(params.poolAddresses);
        } else if (name === 'estimateCosts') {
          toolResult = await toolEstimateCosts();
        } else if (name === 'executeRebalance') {
          const params = args as any;
          toolResult = await toolExecuteRebalance(params.amount, params.targetPoolAddress);
        }

        parts.push({
          functionResponse: {
            name,
            response: toolResult
          }
        });
      }

      // Send all tool results in a single request to conserve API quota
      response = await chat.sendMessage(parts);
      functionCalls = response.response.functionCalls();
    }

    // Print the final reasoning text from the model
    console.log(`\n🤖 [AI Agent Output]:`);
    console.log(response.response.text());

  } catch (err: any) {
    console.error(`❌ Error in Gemini AI execution:`, err.message || err);
  }
}

// Daemon runtime scheduler
async function run() {
  console.log("Starting LLM Yield Optimizer Agent Daemon...");
  console.log(`Polling Interval: ${POLLING_INTERVAL_MS / 1000} seconds`);
  
  // Run once immediately
  await runGenerativeAgent();

  // Schedule intervals
  setInterval(async () => {
    await runGenerativeAgent();
  }, POLLING_INTERVAL_MS);
}

run().catch(console.error);
