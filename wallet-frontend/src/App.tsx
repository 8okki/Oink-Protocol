import { useState, useEffect } from 'react';
import {
  Wallet as WalletIcon,
  Coins,
  PiggyBank,
  Settings as SettingsIcon,
  ShoppingBag,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  ShieldCheck,
  ArrowUpRight,
  X,
  Info,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  getOrCreateEOA,
  initBiconomyAccount,
  fetchBalances,
  calculateRoundUp,
  resetEOA,
  executeOinkPayment,
  executeOinkWithdraw,
  previewWithdrawShares,
  fetchVaultDetails
} from './utils/web3';
import type { WalletDetails, VaultDetailsData } from './utils/web3';

interface Transaction {
  id: string;
  type: 'purchase' | 'savings';
  title: string;
  amount: number;
  roundup: number;
  timestamp: string;
  status: 'success' | 'pending';
  txHash: string;
}

const MERCHANT_ADDRESS = "0x2191e22e44341741D741aC5adE90A23220a84275";
const DEFAULT_VAULT_ADDRESS = "0x2D7d05f5992A9AB1CbA95DAd6A130e7E77C32FF0";

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'merchant' | 'settings' | 'vault'>('dashboard');

  // Wallet State
  const [wallet, setWallet] = useState<WalletDetails | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<boolean>(true);
  const [balances, setBalances] = useState<{ eth: string; usdc: string; eoaUsdc: string; vaultUsdc: string; vaultShares: string }>({ eth: '0.00', usdc: '0.00', eoaUsdc: '0.00', vaultUsdc: '0.00', vaultShares: '0.00' });
  const [copiedText, setCopiedText] = useState<string>('');
  const [showAccountDetails, setShowAccountDetails] = useState<boolean>(false);

  // Vault Monitor State
  const [vaultDetails, setVaultDetails] = useState<VaultDetailsData | null>(null);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState<boolean>(false);
  const [hoveredYieldIndex, setHoveredYieldIndex] = useState<number | null>(null);
  const [hoveredActivityIndex, setHoveredActivityIndex] = useState<number | null>(null);

  // Settings State
  const [oinkPolicyEnabled, setOinkPolicyEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('oink_policy_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [oinkPolicy, setOinkPolicy] = useState<string>(() => {
    return localStorage.getItem('oink_policy') || 'nearest-1';
  });
  const [vaultAddress, setVaultAddress] = useState<string>(() => {
    const saved = localStorage.getItem('oink_vault_address');
    if (saved === "0x18A49aEF7e31ea27E727025185F12FF0633cd6Db") {
      localStorage.setItem('oink_vault_address', DEFAULT_VAULT_ADDRESS);
      return DEFAULT_VAULT_ADDRESS;
    }
    return saved || DEFAULT_VAULT_ADDRESS;
  });

  // Merchant State
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; price: number; emoji: string } | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [checkoutStep, setCheckoutStep] = useState<'idle' | 'confirm' | 'sending' | 'success'>('idle');
  const [activeTxResult, setActiveTxResult] = useState<{
    merchantAmount: number;
    roundupAmount: number;
    totalAmount: number;
    txHash: string;
  } | null>(null);

  // Withdraw State
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawStep, setWithdrawStep] = useState<'idle' | 'confirm' | 'sending' | 'success'>('idle');
  const [withdrawSharesPreview, setWithdrawSharesPreview] = useState<string>('0.00');
  const [activeWithdrawHash, setActiveWithdrawHash] = useState<string>('');

  // Transaction History State
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('oink_transactions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback to initial defaults
      }
    }
    return [
      {
        id: "tx-1",
        type: "purchase",
        title: "Espresso - Cafe Oink",
        amount: 3.25,
        roundup: 0.75,
        timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString(),
        status: "success",
        txHash: "0x4e6b223c6f8d167ae510a8b9f1d07ec62ea34b07fb88de51ca1c67d3e098bc5a"
      },
      {
        id: "tx-2",
        type: "savings",
        title: "Oink Vault Round-Up",
        amount: 0.75,
        roundup: 0,
        timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString(),
        status: "success",
        txHash: "0x4e6b223c6f8d167ae510a8b9f1d07ec62ea34b07fb88de51ca1c67d3e098bc5a"
      },
      {
        id: "tx-3",
        type: "purchase",
        title: "Matcha Latte - Cafe Oink",
        amount: 4.50,
        roundup: 0.50,
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        status: "success",
        txHash: "0x89fd10631ac72b834928271a2d1be3b1e35fa890c01bcfe5a6d71b3e157abdf1"
      },
      {
        id: "tx-4",
        type: "savings",
        title: "Oink Vault Round-Up",
        amount: 0.50,
        roundup: 0,
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        status: "success",
        txHash: "0x89fd10631ac72b834928271a2d1be3b1e35fa890c01bcfe5a6d71b3e157abdf1"
      }
    ] as Transaction[];
  });

  // Load / Initialize Wallet on Mount
  useEffect(() => {
    const pkey = getOrCreateEOA();
    loadWallet(pkey);
  }, []);

  // Sync states to localStorage
  useEffect(() => {
    localStorage.setItem('oink_policy_enabled', String(oinkPolicyEnabled));
  }, [oinkPolicyEnabled]);

  useEffect(() => {
    localStorage.setItem('oink_policy', oinkPolicy);
  }, [oinkPolicy]);

  useEffect(() => {
    localStorage.setItem('oink_vault_address', vaultAddress);
  }, [vaultAddress]);

  useEffect(() => {
    localStorage.setItem('oink_transactions', JSON.stringify(transactions));
  }, [transactions]);

  const loadWallet = async (pkey: string) => {
    setLoadingWallet(true);
    const details = await initBiconomyAccount(pkey);
    setWallet(details);

    // Fetch balances
    const bal = await fetchBalances(details.smartAccountAddress, details.signerAddress, details.isSimulated);
    setBalances(bal);
    setLoadingWallet(false);

    // Fetch vault details
    const vaultDet = await fetchVaultDetails(details.isSimulated);
    setVaultDetails(vaultDet);
  };

  const handleResetWallet = async () => {
    if (window.confirm("Are you sure you want to generate a new EOA? Your old private key will be reset.")) {
      const newPkey = resetEOA();
      await loadWallet(newPkey);
    }
  };

  const handleImportPrivateKey = async () => {
    const pkey = window.prompt("Enter your EOA Private Key (64-character hex starting with 0x):");
    if (pkey) {
      const cleanKey = pkey.trim();
      if (/^0x[a-fA-F0-9]{64}$/.test(cleanKey)) {
        localStorage.setItem("oink_eoa_private_key", cleanKey);
        await loadWallet(cleanKey);
      } else {
        alert("Invalid private key format! It must be a 64-character hex string starting with 0x.");
      }
    }
  };

  const handleRefreshBalances = async () => {
    if (!wallet) return;
    setIsRefreshingBalances(true);

    const bal = await fetchBalances(wallet.smartAccountAddress, wallet.signerAddress, wallet.isSimulated);
    setBalances(bal);

    const vaultDet = await fetchVaultDetails(wallet.isSimulated);
    setVaultDetails(vaultDet);

    setIsRefreshingBalances(false);
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(''), 2000);
  };

  // Store Items definition
  const storeItems = [
    { id: 'coffee', name: 'Oink Espresso', price: 3.25, emoji: '☕' },
    { id: 'croissant', name: 'Butter Croissant', price: 4.50, emoji: '🥐' },
    { id: 'toast', name: 'Avocado Toast', price: 8.75, emoji: '🥑' },
    { id: 'smoothie', name: 'Berry Smoothie', price: 6.10, emoji: '🥤' }
  ];

  const getCheckoutDetails = () => {
    let price = 0;
    let name = "Custom Checkout";

    if (selectedItem) {
      price = selectedItem.price;
      name = selectedItem.name;
    } else {
      price = parseFloat(customAmount) || 0;
    }

    if (price <= 0) return { name, price, roundup: 0, total: 0 };

    if (!oinkPolicyEnabled) {
      return { name, price, roundup: 0, total: price };
    }

    const { total, roundup } = calculateRoundUp(price, oinkPolicy);
    return { name, price, roundup, total };
  };

  const { price: checkoutPrice, roundup: checkoutRoundup, total: checkoutTotal, name: checkoutName } = getCheckoutDetails();

  const handlePayClick = () => {
    if (checkoutPrice <= 0) return;

    // Check if user has enough USDC in their owner EOA signer wallet
    const userUsdc = parseFloat(balances.eoaUsdc);
    const requiredTotal = oinkPolicyEnabled && checkoutRoundup > 0 ? checkoutTotal : checkoutPrice;

    if (userUsdc < requiredTotal) {
      alert(`Insufficient USDC balance! You have $${userUsdc.toFixed(2)} but this transaction requires $${requiredTotal.toFixed(2)}.`);
      return;
    }

    setCheckoutStep('confirm');
  };

  const handleConfirmOink = async () => {
    setCheckoutStep('sending');
    const finalRoundup = oinkPolicyEnabled && checkoutRoundup > 0 ? checkoutRoundup : 0;
    const finalTotal = oinkPolicyEnabled && checkoutRoundup > 0 ? checkoutTotal : checkoutPrice;

    if (!wallet) {
      alert("No wallet connected!");
      setCheckoutStep('idle');
      return;
    }

    try {
      // Run real transaction on-chain via EOA -> Smart Account -> Merchant + Vault
      const txHash = await executeOinkPayment(
        wallet.privateKey,
        wallet.smartAccountAddress,
        MERCHANT_ADDRESS,
        checkoutPrice,
        finalRoundup,
        vaultAddress
      );

      // Refresh actual balances from blockchain
      const bal = await fetchBalances(wallet.smartAccountAddress, wallet.signerAddress, wallet.isSimulated);
      setBalances(bal);

      // Fetch updated vault details
      const vaultDet = await fetchVaultDetails(wallet.isSimulated);
      setVaultDetails(vaultDet);

      // Add transactions to history
      const mainTx: Transaction = {
        id: `tx-m-${Date.now()}`,
        type: 'purchase',
        title: selectedItem ? `${selectedItem.name} Purchase` : 'Merchant Payment',
        amount: checkoutPrice,
        roundup: finalRoundup,
        timestamp: new Date().toISOString(),
        status: 'success',
        txHash: txHash
      };

      let newTxs = [mainTx];

      if (oinkPolicyEnabled && finalRoundup > 0) {
        const savingsTx: Transaction = {
          id: `tx-s-${Date.now()}`,
          type: 'savings',
          title: 'Oink Round-Up Savings',
          amount: finalRoundup,
          roundup: 0,
          timestamp: new Date().toISOString(),
          status: 'success',
          txHash: txHash
        };
        newTxs.push(savingsTx);
      }

      setTransactions(prev => [...newTxs, ...prev]);
      setActiveTxResult({
        merchantAmount: checkoutPrice,
        roundupAmount: finalRoundup,
        totalAmount: finalTotal,
        txHash: txHash
      });
      setCheckoutStep('success');

      // Clean selections
      setSelectedItem(null);
      setCustomAmount('');
    } catch (err: any) {
      console.error("On-chain transaction execution failed:", err);
      alert(`Transaction failed: ${err.message || err}`);
      setCheckoutStep('idle');
    }
  };

  const handleWithdrawClick = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount of USDC to withdraw.");
      return;
    }

    const available = parseFloat(balances.vaultUsdc);
    if (amount > available) {
      alert(`Insufficient savings in OinkVault! You can withdraw up to $${available.toFixed(2)} USDC.`);
      return;
    }

    setWithdrawStep('confirm');

    // Preview the shares to burn
    if (wallet) {
      const shares = await previewWithdrawShares(vaultAddress, amount);
      setWithdrawSharesPreview(shares);
    }
  };

  const handleConfirmWithdraw = async () => {
    setWithdrawStep('sending');
    const amount = parseFloat(withdrawAmount);

    if (!wallet) {
      alert("No wallet connected!");
      setWithdrawStep('idle');
      return;
    }

    try {
      const txHash = await executeOinkWithdraw(
        wallet.privateKey,
        wallet.smartAccountAddress,
        vaultAddress,
        amount
      );

      // Fetch updated balances
      const bal = await fetchBalances(wallet.smartAccountAddress, wallet.signerAddress, wallet.isSimulated);
      setBalances(bal);

      // Fetch updated vault details
      const vaultDet = await fetchVaultDetails(wallet.isSimulated);
      setVaultDetails(vaultDet);

      // Add withdrawal to transaction history
      const withdrawTx: Transaction = {
        id: `tx-w-${Date.now()}`,
        type: 'savings',
        title: 'Oink Vault Savings Withdrawal',
        amount: amount,
        roundup: 0,
        timestamp: new Date().toISOString(),
        status: 'success',
        txHash: txHash
      };

      setTransactions(prev => [withdrawTx, ...prev]);
      setActiveWithdrawHash(txHash);
      setWithdrawStep('success');
    } catch (err: any) {
      console.error("On-chain withdrawal failed:", err);
      alert(`Withdrawal failed: ${err.message || err}`);
      setWithdrawStep('idle');
    }
  };

  // 1. Interpolated Yield Gains data over the past 24 hours
  const yieldHistory = Array.from({ length: 24 }, (_, i) => {
    const hour = 23 - i;
    const date = new Date(Date.now() - hour * 3600 * 1000);
    const hourStr = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    const currentPrice = vaultDetails ? parseFloat(vaultDetails.sharePrice) : 1.0294;
    const startPrice = 1.0000;

    // Smooth compounding curve with a little organic drift
    const progress = i / 23;
    const curve = Math.sin(progress * Math.PI * 0.5) * 0.95 + progress * 0.05;
    const price = startPrice + (currentPrice - startPrice) * curve;

    const supply = vaultDetails ? parseFloat(vaultDetails.totalSupply) : 1380.00;
    const yieldEarned = (price - 1.0000) * supply;

    return {
      date: hourStr,
      fullDate: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + hourStr,
      sharePrice: price.toFixed(4),
      yieldEarned: Math.max(0, yieldEarned).toFixed(2),
      percentage: ((price - 1.0000) * 100).toFixed(2)
    };
  });

  // 2. Hybrid mock/real Vault activity history over the past 24 hours
  const activityHistory = Array.from({ length: 24 }, (_, i) => {
    const hour = 23 - i;
    const date = new Date(Date.now() - hour * 3600 * 1000);
    const hourStr = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    const startOfHour = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 0, 0, 0).getTime();
    const endOfHour = startOfHour + 3600 * 1000;

    let deposits = 0;
    let withdrawals = 0;

    transactions.forEach(tx => {
      const txTime = new Date(tx.timestamp).getTime();
      if (txTime >= startOfHour && txTime < endOfHour && tx.status === 'success') {
        if (tx.type === 'savings') {
          if (tx.title.includes('Withdrawal')) {
            withdrawals += tx.amount;
          } else {
            deposits += tx.amount;
          }
        }
      }
    });

    return {
      date: hourStr,
      fullDate: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + hourStr,
      deposits: parseFloat(deposits.toFixed(2)),
      withdrawals: parseFloat(withdrawals.toFixed(2))
    };
  });

  // Yield Gains chart helper variables
  const prices = yieldHistory.map(d => parseFloat(d.sharePrice));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 0.01;
  const yMin = Math.max(1.0, minPrice - priceRange * 0.15);
  const yMax = maxPrice + priceRange * 0.15;

  const getLinePath = () => {
    return yieldHistory.map((d, index) => {
      const x = (index / (yieldHistory.length - 1)) * 500;
      const y = 170 - ((parseFloat(d.sharePrice) - yMin) / (yMax - yMin)) * 140;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  const getAreaPath = () => {
    const linePath = getLinePath();
    if (!linePath) return '';
    return `${linePath} L 500 170 L 0 170 Z`;
  };

  const maxVolume = Math.max(...activityHistory.map(d => Math.max(d.deposits, d.withdrawals)), 4.0);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <a href="#" className="sidebar-logo" onClick={() => setActiveTab('dashboard')}>
          <img src="/piggybank_logo.png" alt="Oink" className="sidebar-logo-img" />
          <span>Oink Protocol</span>
        </a>

        <nav className="nav-links">
          <div
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <WalletIcon size={20} />
            <span>Smart Wallet</span>
          </div>

          <div
            className={`nav-link ${activeTab === 'merchant' ? 'active' : ''}`}
            onClick={() => setActiveTab('merchant')}
          >
            <ShoppingBag size={20} />
            <span>Merchants</span>
          </div>

          <div
            className={`nav-link ${activeTab === 'vault' ? 'active' : ''}`}
            onClick={() => setActiveTab('vault')}
          >
            <TrendingUp size={20} />
            <span>Dashboard</span>
          </div>

          <div
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={20} />
            <span>Oink Settings</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="connection-pill connected">
            <span className="connection-dot"></span>
            <span>Arc Testnet</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">

        {/* Header */}
        <header className="header">
          <div className="header-title">
            {activeTab === 'dashboard' && (
              <>
                <h1>Oink Smart Wallet</h1>
                <p>Track your balances, smart account details, and automatic round-up savings.</p>
              </>
            )}
            {activeTab === 'merchant' && (
              <>
                <h1>Merchant Sandbox</h1>
                <p>Simulate point-of-sale payments to test your Oink round-up policy.</p>
              </>
            )}
            {activeTab === 'settings' && (
              <>
                <h1>Configure Oink</h1>
                <p>Customize how your spare change is routed to your Oink savings vault.</p>
              </>
            )}
            {activeTab === 'vault' && (
              <>
                <h1>OinkVault Analytics</h1>
                <p>Monitor vault balance, share price, yield growth, and transaction activity.</p>
              </>
            )}
          </div>

          <div className="header-actions">
            {wallet && (
              <div className="connection-pill connected">
                <span className="connection-dot"></span>
                <span>Oink Smart Wallet</span>
              </div>
            )}

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRefreshBalances}
              disabled={isRefreshingBalances || loadingWallet}
              title="Refresh balances from blockchain"
            >
              <RefreshCw size={14} className={isRefreshingBalances ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {/* Loading overlay when initializing wallet */}
        {loadingWallet ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '4rem 0' }}>
            <div className="spinner pink" style={{ width: '48px', height: '48px', borderWidth: '4px', marginBottom: '1.5rem' }}></div>
            <h3>Setting up Oink Smart Wallet...</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Initializing secure transaction client</p>
          </div>
        ) : (
          <>
            {/* TAB: DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div className="tab-content">

                {/* Account Details Card */}
                <div className="glass-card glow-primary wallet-conn-card" style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', marginBottom: showAccountDetails ? '1.5rem' : '0' }}>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldCheck color="var(--primary)" size={24} />
                        Oink Smart Wallet
                      </h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Secure, gas-optimized smart piggy bank wallet.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <button className="btn btn-secondary btn-sm" onClick={handleImportPrivateKey}>
                        Import Key
                      </button>
                      <button className="btn btn-secondary btn-sm btn-danger" onClick={handleResetWallet}>
                        Reset Key
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, minWidth: '32px' }}
                        onClick={() => setShowAccountDetails(!showAccountDetails)}
                        title={showAccountDetails ? "Hide Wallet Details" : "Show Wallet Details"}
                      >
                        {showAccountDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {showAccountDetails && (
                    <div className="wallet-connected-grid" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
                      <div className="wallet-details">
                        <div className="detail-row">
                          <span className="detail-label">Smart Account Address</span>
                          <div className="detail-value">
                            {wallet ? `${wallet.smartAccountAddress.slice(0, 8)}...${wallet.smartAccountAddress.slice(-8)}` : '0x0'}
                            <button className="copy-btn" onClick={() => wallet && handleCopy(wallet.smartAccountAddress, 'sa')}>
                              {copiedText === 'sa' ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>

                        <div className="detail-row">
                          <span className="detail-label">EOA Signer Address (Owner)</span>
                          <div className="detail-value">
                            {wallet ? `${wallet.signerAddress.slice(0, 8)}...${wallet.signerAddress.slice(-8)}` : '0x0'}
                            <button className="copy-btn" onClick={() => wallet && handleCopy(wallet.signerAddress, 'eoa')}>
                              {copiedText === 'eoa' ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="wallet-details">
                        <div className="detail-row">
                          <span className="detail-label">Network</span>
                          <span className="detail-value" style={{ background: 'rgba(219, 39, 119, 0.05)', color: 'var(--primary)', borderColor: 'rgba(219, 39, 119, 0.15)', borderWidth: '1px', borderStyle: 'solid' }}>
                            Arc Testnet (Chain 5042002)
                          </span>
                        </div>

                        <div className="detail-row">
                          <span className="detail-label">Deployment Status</span>
                          <span className="status-indicator success">
                            <Check size={12} />
                            Active (Demo Ready)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Balances Section */}
                <div className="balance-card-grid">
                  <div className="glass-card glow-pink">
                    <div className="balance-item">
                      <div className="balance-header">
                        <span>Current Wallet Balance</span>
                        <Coins size={18} color="#2775ca" />
                      </div>
                      <div className="balance-amount highlight-pink">
                        ${parseFloat(balances.eoaUsdc).toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>USDC</span>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card glow-pink">
                    <div className="balance-item">
                      <div className="balance-header">
                        <span>Current Oink Savings</span>
                        <PiggyBank size={18} color="var(--secondary)" />
                      </div>
                      <div className="balance-amount highlight-pink">
                        {parseFloat(balances.vaultShares).toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>ybOINK</span>
                      </div>
                      <div className="balance-footer" style={{ marginBottom: '1rem' }}>
                        Equivalent to ${parseFloat(balances.vaultUsdc).toFixed(2)} USDC on-chain
                      </div>

                      {/* Withdraw Action */}
                      <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--card-border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Withdraw USDC"
                          className="custom-input pink"
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', height: '36px', width: '100%', margin: 0 }}
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                        />
                        <button
                          className="btn btn-pink btn-sm"
                          style={{ height: '36px', whiteSpace: 'nowrap', padding: '0 0.85rem' }}
                          onClick={handleWithdrawClick}
                          disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0}
                        >
                          Withdraw
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity History Section */}
                <div style={{ marginTop: '1.5rem' }}>
                  {/* Tx History */}
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Activity History</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest updates</span>
                    </div>

                    <div className="tx-list">
                      {transactions.length === 0 ? (
                        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No transactions recorded yet.
                        </div>
                      ) : (
                        transactions.map((tx) => (
                          <div key={tx.id} className="tx-item">
                            <div className="tx-icon-details">
                              <div className={`tx-icon-wrapper ${tx.type}`}>
                                {tx.type === 'purchase' ? <ShoppingBag size={16} /> : <PiggyBank size={16} />}
                              </div>
                              <div className="tx-meta">
                                <span className="tx-title">{tx.title}</span>
                                <span className="tx-time">
                                  {new Date(tx.timestamp).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="tx-amounts">
                              <span className="tx-value">
                                {tx.type === 'purchase' ? '-' : '+'}${tx.amount.toFixed(2)}
                              </span>
                              {tx.type === 'purchase' && tx.roundup > 0 && (
                                <span className="tx-roundup-tag">
                                  🐖 +${tx.roundup.toFixed(2)} Saved
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* TAB: MOCK MERCHANT */}
            {activeTab === 'merchant' && (
              <div className="tab-content">
                <div className="glass-card merchant-layout">

                  {/* Storefront Selection */}
                  <div>
                    <div className="merchant-header">
                      <div className="merchant-logo">☕</div>
                      <div className="merchant-title">
                        <h2>Cafe Oink & Bakery</h2>
                        <p>Simulated Point of Sale (POS) terminal</p>
                      </div>
                    </div>

                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>Select an Item to Purchase</h3>

                    <div className="store-grid">
                      {storeItems.map((item) => (
                        <div
                          key={item.id}
                          className={`store-item ${selectedItem?.id === item.id ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedItem(item);
                            setCustomAmount('');
                          }}
                        >
                          <span className="store-item-emoji">{item.emoji}</span>
                          <span className="store-item-name">{item.name}</span>
                          <span className="store-item-price">${item.price.toFixed(2)}</span>
                          {selectedItem?.id === item.id && (
                            <span className="store-item-badge">Selected</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ margin: '1.5rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ height: '1px', background: 'var(--card-border)', flex: 1 }}></span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dark)', fontWeight: 600 }}>OR ENTER CUSTOM AMOUNT</span>
                        <span style={{ height: '1px', background: 'var(--card-border)', flex: 1 }}></span>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)' }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Enter custom USDC amount"
                          className="custom-input pink"
                          style={{ paddingLeft: '32px' }}
                          value={customAmount}
                          onChange={(e) => {
                            setCustomAmount(e.target.value);
                            setSelectedItem(null);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Summary & Checkout Actions */}
                  <div className="checkout-summary" style={{ background: 'rgba(0, 0, 0, 0.15)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--card-border)' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', color: 'var(--text)' }}>
                      Order Summary
                    </h3>

                    <div style={{ flex: 1 }}>
                      {checkoutPrice > 0 ? (
                        <>
                          <div className="receipt-row">
                            <span style={{ color: 'var(--text-muted)' }}>{checkoutName}</span>
                            <span>${checkoutPrice.toFixed(2)} USDC</span>
                          </div>

                          {oinkPolicyEnabled && checkoutRoundup > 0 ? (
                            <>
                              <div className="receipt-row" style={{ color: 'var(--secondary)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                                  <span>🐖 Oink Round-Up</span>
                                  <span style={{ fontSize: '0.7rem', padding: '1px 5px', background: 'rgba(236,72,153,0.12)', borderRadius: '4px', textTransform: 'uppercase' }}>
                                    {oinkPolicy.replace('nearest-', 'Nearest $')}
                                  </span>
                                </span>
                                <span style={{ fontWeight: 600 }}>+${checkoutRoundup.toFixed(2)} USDC</span>
                              </div>

                              <div className="roundup-preview-alert">
                                <PiggyBank className="icon" size={16} />
                                <div className="roundup-preview-text">
                                  <div className="roundup-preview-title">Round-up Active!</div>
                                  Spare change of <strong>${checkoutRoundup.toFixed(2)} USDC</strong> will automatically route to your Oink Vault.
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="receipt-row" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--card-border)', marginTop: '0.5rem' }}>
                              <span>No round-up spare-change generated. (Oink policy is {oinkPolicyEnabled ? 'enabled' : 'disabled'}).</span>
                            </div>
                          )}

                          <div className="receipt-row total">
                            <span>Total Bill</span>
                            <span>${checkoutTotal.toFixed(2)} USDC</span>
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-dark)', fontSize: '0.9rem' }}>
                          Select an item or enter a custom price to check out.
                        </div>
                      )}
                    </div>

                    <button
                      className="btn btn-pink btn-block"
                      style={{ marginTop: 'auto' }}
                      disabled={checkoutPrice <= 0}
                      onClick={handlePayClick}
                    >
                      <Coins size={18} />
                      Pay with Oink Wallet
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* TAB: SETTINGS */}
            {activeTab === 'settings' && (
              <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>



                {/* Oink Round-Up Status Card */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Oink Round-Up Status</h3>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'stretch' }}>

                    {/* Status Toggle */}
                    <div className="switch-control" style={{ flex: '1 1 300px', background: 'rgba(255,255,255,0.01)', margin: 0 }}>
                      <div className="switch-label">
                        <span className="switch-title">Auto-Savings Policy</span>
                        <span className="switch-desc">
                          {oinkPolicyEnabled ? 'Actively rounding up transactions' : 'Round-ups are currently suspended'}
                        </span>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={oinkPolicyEnabled}
                          onChange={(e) => setOinkPolicyEnabled(e.target.checked)}
                        />
                        <span className="slider pink"></span>
                      </label>
                    </div>

                    {/* Active Policy Type display */}
                    <div style={{ flex: '1 1 200px', padding: '1rem', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>ACTIVE POLICY TYPE</div>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', textTransform: 'capitalize' }}>
                        {oinkPolicy.replace('-', ' ')}
                      </span>
                    </div>

                    {/* Round-Up Routing Info */}
                    <div className="roundup-preview-alert" style={{ flex: '2 1 350px', margin: 0, background: 'rgba(139, 92, 246, 0.04)', borderColor: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center' }}>
                      <Info size={16} className="icon" style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      <div className="roundup-preview-text">
                        <div className="roundup-preview-title" style={{ color: 'var(--primary)' }}>Round-Up Routing</div>
                        Your spare change transfers are batched atomically. No double signature required.
                      </div>
                    </div>

                  </div>
                </div>

                <div className="glass-card settings-grid">

                  {/* Left Column: Rules & Presets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', color: 'var(--text)' }}>
                      Oink Round-Up Rules
                    </h3>

                    {/* Round-up Presets */}
                    <div className="form-group" style={{ opacity: oinkPolicyEnabled ? 1 : 0.5, pointerEvents: oinkPolicyEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                      <label>
                        <Sliders size={16} color="var(--secondary)" />
                        Select Round-Up Policy
                      </label>
                      <div className="policy-options">
                        <div
                          className={`policy-card ${oinkPolicy === 'nearest-1' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('nearest-1')}
                        >
                          <span className="policy-card-title">Nearest $1</span>
                          <span className="policy-card-desc">Standard (Default)</span>
                        </div>
                        <div
                          className={`policy-card ${oinkPolicy === 'nearest-5' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('nearest-5')}
                        >
                          <span className="policy-card-title">Nearest $5</span>
                          <span className="policy-card-desc">Accelerate savings</span>
                        </div>
                        <div
                          className={`policy-card ${oinkPolicy === 'nearest-10' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('nearest-10')}
                        >
                          <span className="policy-card-title">Nearest $10</span>
                          <span className="policy-card-desc">Maximum savings</span>
                        </div>
                      </div>
                    </div>

                    {/* Fixed Round-ups */}
                    <div className="form-group" style={{ opacity: oinkPolicyEnabled ? 1 : 0.5, pointerEvents: oinkPolicyEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                      <label>Fixed Sparings Policy</label>
                      <div className="policy-options">
                        <div
                          className={`policy-card ${oinkPolicy === 'fixed-0.5' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('fixed-0.5')}
                        >
                          <span className="policy-card-title">+$0.50</span>
                          <span className="policy-card-desc">Add flat $0.50</span>
                        </div>
                        <div
                          className={`policy-card ${oinkPolicy === 'fixed-1' ? 'selected pink' : ''}`}
                          onClick={() => setOinkPolicy('fixed-1')}
                        >
                          <span className="policy-card-title">+$1.00</span>
                          <span className="policy-card-desc">Add flat $1.00</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Dest Vault Config */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', color: 'var(--text)' }}>
                      Routing & Destination
                    </h3>

                    <div className="form-group">
                      <label style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <span>Target Savings Vault (OinkVault)</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dark)' }}>Verified Contract</span>
                      </label>
                      <input
                        type="text"
                        className="custom-input"
                        value={vaultAddress}
                        onChange={(e) => setVaultAddress(e.target.value)}
                        placeholder="0x..."
                      />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        This is the address of the OinkVault smart contract where your rounded-up USDC funds are held and earn yield.
                      </p>
                    </div>

                    <div style={{ background: 'rgba(236, 72, 153, 0.04)', border: '1px dashed rgba(236, 72, 153, 0.2)', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginTop: 'auto' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <PiggyBank size={18} />
                        How does Oink work?
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                        Every time you perform a transaction with your Oink smart wallet, the contract calculates the spare change according to your active policy rules.
                        It packages both your payment and the savings transfer into a single transaction batch, reducing gas overhead.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* TAB: VAULT MONITOR */}
            {activeTab === 'vault' && (() => {
              const lineTicks = [0, 6, 12, 18, 23];
              const priceGridValues = [yMin, yMin + (yMax - yMin) / 2, yMax];
              return (
                <div className="tab-content">
                  <div className="vault-panel">

                    {/* Grid of stats */}
                    <div className="vault-metrics-grid">

                      {/* Metric 1: Total Assets */}
                      <div className="glass-card vault-card highlighted">
                        <div className="vault-card-title">
                          <Coins size={16} color="var(--primary)" />
                          Total Assets Under Management
                        </div>
                        <div className="vault-card-value">
                          ${vaultDetails ? parseFloat(vaultDetails.totalAssets).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} USDC
                        </div>
                        <div className="vault-card-desc">
                          Total funds deposited in OinkVault (Cash + Yield)
                        </div>

                        <div className="allocation-bar-container">
                          <div className="allocation-bar-labels">
                            <span>Local Balance (Cash)</span>
                            <span>Lending Pools (Yielding)</span>
                          </div>
                          <div className="allocation-bar">
                            <div
                              className="allocation-segment cash"
                              style={{
                                width: `${vaultDetails && parseFloat(vaultDetails.totalAssets) > 0
                                  ? (parseFloat(vaultDetails.localBalance) / parseFloat(vaultDetails.totalAssets)) * 100
                                  : 50}%`
                              }}
                            />
                            <div
                              className="allocation-segment allocated"
                              style={{
                                width: `${vaultDetails && parseFloat(vaultDetails.totalAssets) > 0
                                  ? (parseFloat(vaultDetails.allocatedBalance) / parseFloat(vaultDetails.totalAssets)) * 100
                                  : 50}%`
                              }}
                            />
                          </div>
                          <div className="allocation-legend">
                            <div className="legend-item">
                              <span className="legend-dot cash"></span>
                              <span>Idle: ${vaultDetails ? parseFloat(vaultDetails.localBalance).toFixed(2) : '0.00'} USDC</span>
                            </div>
                            <div className="legend-item">
                              <span className="legend-dot allocated"></span>
                              <span>Yielding: ${vaultDetails ? parseFloat(vaultDetails.allocatedBalance).toFixed(2) : '0.00'} USDC</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Metric 2: Share Price */}
                      <div className="glass-card vault-card">
                        <div className="vault-card-title">
                          <TrendingUp size={16} color="var(--primary)" />
                          Vault Share Price (ybOINK)
                        </div>
                        <div className="vault-card-value">
                          {vaultDetails ? parseFloat(vaultDetails.sharePrice).toFixed(4) : '1.0000'}
                        </div>
                        <div className="vault-card-desc">
                          Exchange rate representing yield gains relative to USDC
                        </div>

                        {vaultDetails && parseFloat(vaultDetails.sharePrice) > 1.0 && (
                          <div className="yield-badge">
                            <span>📈</span>
                            <span>+{((parseFloat(vaultDetails.sharePrice) - 1.0) * 100).toFixed(2)}% Cumulative yield gain</span>
                          </div>
                        )}
                      </div>


                    </div>

                    {/* Grid of charts */}
                    <div className="vault-charts-grid">

                      {/* Chart 1: Yield Growth */}
                      <div className="glass-card chart-card">
                        <div className="chart-header">
                          <div>
                            <h3 className="chart-title">Yield Gains Growth</h3>
                            <p className="chart-subtitle">Progressive increase of share value and compounding earnings (24h)</p>
                          </div>
                          <div className="legend-item" style={{ background: 'rgba(236, 72, 153, 0.05)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                            <span className="legend-dot allocated"></span>
                            <span style={{ color: 'var(--text-dark)', fontWeight: 600 }}>ybOINK Rate</span>
                          </div>
                        </div>

                        <div className="chart-wrapper">
                          {/* Tooltip Overlay */}
                          {hoveredYieldIndex !== null && (
                            <div
                              className="chart-tooltip"
                              style={{
                                left: `${(hoveredYieldIndex / (yieldHistory.length - 1)) * 80}%`,
                                top: '10px'
                              }}
                            >
                              <div className="tooltip-date">{yieldHistory[hoveredYieldIndex].fullDate}</div>
                              <div className="tooltip-row">
                                <span className="tooltip-label">Share Price:</span>
                                <span className="tooltip-val">{yieldHistory[hoveredYieldIndex].sharePrice} USDC</span>
                              </div>
                              <div className="tooltip-row">
                                <span className="tooltip-label">Est. Earnings:</span>
                                <span className="tooltip-val positive">+${yieldHistory[hoveredYieldIndex].yieldEarned} USDC</span>
                              </div>
                              <div className="tooltip-row">
                                <span className="tooltip-label">ROI:</span>
                                <span className="tooltip-val positive">+{yieldHistory[hoveredYieldIndex].percentage}%</span>
                              </div>
                            </div>
                          )}

                          <svg
                            className="chart-svg"
                            viewBox="0 0 500 200"
                            preserveAspectRatio="none"
                            onMouseMove={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const svgWidth = rect.width;
                              const index = Math.round((x / svgWidth) * (yieldHistory.length - 1));
                              if (index >= 0 && index < yieldHistory.length) {
                                setHoveredYieldIndex(index);
                              }
                            }}
                            onMouseLeave={() => setHoveredYieldIndex(null)}
                          >
                            <defs>
                              <linearGradient id="yieldAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Grid Lines */}
                            {priceGridValues.map((val, idx) => {
                              const y = 170 - ((val - yMin) / (yMax - yMin)) * 140;
                              return (
                                <g key={`ygrid-${idx}`}>
                                  <line
                                    x1={0}
                                    y1={y}
                                    x2={500}
                                    y2={y}
                                    stroke="rgba(236, 72, 153, 0.08)"
                                    strokeDasharray="2 2"
                                  />
                                  <text
                                    x={5}
                                    y={y - 4}
                                    fontSize="9"
                                    fill="var(--text-muted)"
                                    fontWeight="500"
                                  >
                                    {val.toFixed(4)} USDC
                                  </text>
                                </g>
                              );
                            })}

                            {lineTicks.map(idx => (
                              <line
                                key={`grid-${idx}`}
                                x1={(idx / (yieldHistory.length - 1)) * 500}
                                y1={30}
                                x2={(idx / (yieldHistory.length - 1)) * 500}
                                y2={170}
                                stroke="rgba(236, 72, 153, 0.05)"
                                strokeDasharray="4 4"
                              />
                            ))}

                            {/* Area path */}
                            <path
                              d={getAreaPath()}
                              fill="url(#yieldAreaGrad)"
                              style={{ transition: 'all 0.3s ease' }}
                            />

                            {/* Line path */}
                            <path
                              d={getLinePath()}
                              fill="none"
                              stroke="var(--primary)"
                              strokeWidth={2.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ transition: 'all 0.3s ease' }}
                            />

                            {/* Interactive Hover Guides */}
                            {hoveredYieldIndex !== null && (() => {
                              const x = (hoveredYieldIndex / (yieldHistory.length - 1)) * 500;
                              const y = 170 - ((parseFloat(yieldHistory[hoveredYieldIndex].sharePrice) - yMin) / (yMax - yMin)) * 140;
                              return (
                                <>
                                  <line
                                    x1={x}
                                    y1={30}
                                    x2={x}
                                    y2={170}
                                    stroke="var(--primary)"
                                    strokeWidth={1.5}
                                    strokeDasharray="3 3"
                                  />
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r={6}
                                    fill="var(--primary)"
                                    stroke="#ffffff"
                                    strokeWidth={2}
                                    style={{ filter: 'drop-shadow(0 0 4px var(--primary))' }}
                                  />
                                </>
                              );
                            })()}

                            {/* X-axis Labels */}
                            {lineTicks.map(idx => (
                              <text
                                key={`lbl-${idx}`}
                                x={(idx / (yieldHistory.length - 1)) * 500}
                                y={190}
                                textAnchor="middle"
                                fontSize="10"
                                fill="var(--text-muted)"
                              >
                                {yieldHistory[idx].date}
                              </text>
                            ))}
                          </svg>
                        </div>
                      </div>

                      {/* Chart 2: Vault Activity */}
                      <div className="glass-card chart-card">
                        <div className="chart-header">
                          <div>
                            <h3 className="chart-title">Vault Activity History</h3>
                            <p className="chart-subtitle">Hourly volume of deposits & withdrawals (24h)</p>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <div className="legend-item" style={{ fontSize: '0.75rem' }}>
                              <span className="legend-dot cash" style={{ width: '8px', height: '8px' }}></span>
                              <span>Deposits</span>
                            </div>
                            <div className="legend-item" style={{ fontSize: '0.75rem' }}>
                              <span className="legend-dot" style={{ width: '8px', height: '8px', background: 'transparent', border: '1.5px solid var(--text-muted)', borderRadius: '50%' }}></span>
                              <span>Withdrawals</span>
                            </div>
                          </div>
                        </div>

                        <div className="chart-wrapper">
                          {/* Tooltip Overlay */}
                          {hoveredActivityIndex !== null && (
                            <div
                              className="chart-tooltip"
                              style={{
                                left: `${(hoveredActivityIndex / (activityHistory.length - 1)) * 75}%`,
                                top: '10px'
                              }}
                            >
                              <div className="tooltip-date">{activityHistory[hoveredActivityIndex].fullDate}</div>
                              <div className="tooltip-row">
                                <span className="tooltip-label">Deposits:</span>
                                <span className="tooltip-val positive">+${activityHistory[hoveredActivityIndex].deposits.toFixed(2)} USDC</span>
                              </div>
                              <div className="tooltip-row">
                                <span className="tooltip-label">Withdrawals:</span>
                                <span className="tooltip-val negative">-${activityHistory[hoveredActivityIndex].withdrawals.toFixed(2)} USDC</span>
                              </div>
                            </div>
                          )}

                          <svg
                            className="chart-svg"
                            viewBox="0 0 500 200"
                            preserveAspectRatio="none"
                            onMouseMove={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const svgWidth = rect.width;
                              const index = Math.floor((x / svgWidth) * activityHistory.length);
                              if (index >= 0 && index < activityHistory.length) {
                                setHoveredActivityIndex(index);
                              }
                            }}
                            onMouseLeave={() => setHoveredActivityIndex(null)}
                          >
                            {/* Grid Lines */}
                            {[0, maxVolume / 2, maxVolume].map((val, idx) => {
                              const y = 170 - (val / maxVolume) * 130;
                              return (
                                <g key={`actgrid-${idx}`}>
                                  <line
                                    x1={0}
                                    y1={y}
                                    x2={500}
                                    y2={y}
                                    stroke="rgba(236, 72, 153, 0.08)"
                                    strokeDasharray="2 2"
                                  />
                                  {val > 0 && (
                                    <text
                                      x={5}
                                      y={y - 4}
                                      fontSize="9"
                                      fill="var(--text-muted)"
                                      fontWeight="500"
                                    >
                                      {val.toFixed(1)} USDC
                                    </text>
                                  )}
                                </g>
                              );
                            })}

                            {/* Hover Column Highlight */}
                            {hoveredActivityIndex !== null && (() => {
                              const slotW = 500 / activityHistory.length;
                              const x = hoveredActivityIndex * slotW;
                              return (
                                <rect
                                  x={x + 1}
                                  y={30}
                                  width={slotW - 2}
                                  height={140}
                                  fill="rgba(236, 72, 153, 0.04)"
                                  rx={4}
                                />
                              );
                            })()}

                            {/* Bars */}
                            {activityHistory.map((d, index) => {
                              const slotW = 500 / activityHistory.length;
                              const xCenter = index * slotW + slotW / 2;
                              const barW = Math.max(3, slotW * 0.25);
                              const xDep = xCenter - barW - 1;
                              const xWith = xCenter + 1;
                              const depH = (d.deposits / maxVolume) * 130;
                              const withH = (d.withdrawals / maxVolume) * 130;
                              const yDep = 170 - depH;
                              const yWith = 170 - withH;
                              const isHovered = hoveredActivityIndex === index;

                              return (
                                <g key={`activity-hour-${index}`}>
                                  {/* Deposit Bar */}
                                  {d.deposits > 0 && (
                                    <rect
                                      x={xDep}
                                      y={yDep}
                                      width={barW}
                                      height={depH}
                                      fill={isHovered ? "var(--primary)" : "var(--secondary)"}
                                      rx={1.5}
                                      style={{ transition: 'all 0.15s ease' }}
                                    />
                                  )}
                                  {/* Withdrawal Bar */}
                                  {d.withdrawals > 0 && (
                                    <rect
                                      x={xWith}
                                      y={yWith}
                                      width={barW}
                                      height={withH}
                                      fill="none"
                                      stroke="var(--text-muted)"
                                      strokeWidth={1.5}
                                      rx={1.5}
                                      style={{ transition: 'all 0.15s ease' }}
                                    />
                                  )}
                                </g>
                              );
                            })}

                            {/* X Axis Line */}
                            <line
                              x1={0}
                              y1={170}
                              x2={500}
                              y2={170}
                              stroke="rgba(236, 72, 153, 0.15)"
                              strokeWidth={1.5}
                            />

                            {/* X-axis Labels */}
                            {activityHistory.map((d, index) => {
                              if (index % 6 !== 0 && index !== activityHistory.length - 1) return null;
                              const slotW = 500 / activityHistory.length;
                              return (
                                <text
                                  key={`actlbl-${index}`}
                                  x={index * slotW + slotW / 2}
                                  y={190}
                                  textAnchor="middle"
                                  fontSize="9"
                                  fill="var(--text-muted)"
                                >
                                  {d.date}
                                </text>
                              );
                            })}
                          </svg>
                        </div>
                      </div>

                    </div>

                  </div>
                </div>
              );
            })()}
          </>
        )}
      </main>

      {/* CONFIRM TRANSACTION MODAL */}
      {checkoutStep === 'confirm' && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => setCheckoutStep('idle')}>
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-badge-icon">{oinkPolicyEnabled && checkoutRoundup > 0 ? "🐖" : "💳"}</div>
              <h3>{oinkPolicyEnabled && checkoutRoundup > 0 ? "Confirm Transaction with Oink" : "Confirm Transaction"}</h3>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ textAlign: 'center', fontSize: '0.95rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>
                {oinkPolicyEnabled && checkoutRoundup > 0 ? (
                  <>
                    Confirm transaction of <strong style={{ color: 'var(--text)' }}>${checkoutPrice.toFixed(2)} USDC</strong> with an Oink round-up of <strong style={{ color: 'var(--secondary)' }}>${checkoutRoundup.toFixed(2)} USDC</strong>?
                  </>
                ) : (
                  <>
                    Confirm transaction of <strong style={{ color: 'var(--text)' }}>${checkoutPrice.toFixed(2)} USDC</strong> (Oink round-up is disabled)?
                  </>
                )}
              </p>

              <div className="oink-receipt">
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Purchase Amount</span>
                  <span>${checkoutPrice.toFixed(2)} USDC</span>
                </div>

                <div className="oink-receipt-row highlight" style={{ opacity: oinkPolicyEnabled && checkoutRoundup > 0 ? 1 : 0.5 }}>
                  <span>Oink Round-Up {!(oinkPolicyEnabled && checkoutRoundup > 0) && "(Disabled)"}</span>
                  <span>{oinkPolicyEnabled && checkoutRoundup > 0 ? `+$${checkoutRoundup.toFixed(2)}` : "$0.00"} USDC</span>
                </div>

                <div className="oink-receipt-row total-row">
                  <span>Total Debit</span>
                  <span>${(oinkPolicyEnabled && checkoutRoundup > 0 ? checkoutTotal : checkoutPrice).toFixed(2)} USDC</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.12)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                <ShieldCheck size={20} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  {oinkPolicyEnabled && checkoutRoundup > 0 ? (
                    <>
                      <strong>Batched Transaction:</strong> Both the merchant payment and your spare-change round-up split are executed in a single atomic transaction bundle.
                    </>
                  ) : (
                    <>
                      <strong>Smart Account Execution:</strong> Your merchant payment will be executed directly via your secure smart account contract with no round-up savings split.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCheckoutStep('idle')}>
                Cancel
              </button>
              <button className="btn btn-pink" onClick={handleConfirmOink}>
                Confirm & Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SENDING USER OPERATION MODAL */}
      {checkoutStep === 'sending' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div className="spinner pink" style={{ margin: '0 auto 1.5rem auto', width: '48px', height: '48px', borderWidth: '4px' }}></div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Executing transaction bundle...
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <p style={{ color: 'var(--text)', fontWeight: 500 }}>Batching transactions together</p>
              <p>1. Approving USDC spending...</p>
              <p>2. Initiating transfer to Merchant...</p>
              <p>3. Rerouting spare-change to OinkVault...</p>
              <p style={{ marginTop: '0.5rem', fontStyle: 'italic', fontSize: '0.75rem' }}>Awaiting signature & block inclusion...</p>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION SUCCESS MODAL */}
      {checkoutStep === 'success' && activeTxResult && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => setCheckoutStep('idle')}>
              <X size={20} />
            </button>

            <div className="success-screen">
              <div className="success-badge">
                <Check size={36} />
              </div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.5rem' }}>
                Payment Successful!
              </h3>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                Your transaction bundle has been confirmed.
              </p>

              <div className="oink-receipt" style={{ width: '100%', margin: '0.5rem 0' }}>
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Merchant Payment</span>
                  <span>${activeTxResult.merchantAmount.toFixed(2)} USDC</span>
                </div>

                {activeTxResult.roundupAmount > 0 && (
                  <div className="oink-receipt-row highlight">
                    <span>Oink Vault Rerouted</span>
                    <span>+${activeTxResult.roundupAmount.toFixed(2)} USDC</span>
                  </div>
                )}

                <div className="oink-receipt-row total-row">
                  <span>Total Executed</span>
                  <span>${activeTxResult.totalAmount.toFixed(2)} USDC</span>
                </div>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--card-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Success (Block Confirmed)</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tx Hash</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {activeTxResult.txHash.slice(0, 10)}...{activeTxResult.txHash.slice(-10)}
                  </span>
                </div>

                <a
                  href={`https://explorer.testnet.arc.network/tx/${activeTxResult.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tx-hash-link"
                  style={{ alignSelf: 'center' }}
                >
                  View on Arc Explorer <ArrowUpRight size={12} />
                </a>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1.25rem' }}
                onClick={() => {
                  setCheckoutStep('idle');
                  setActiveTab('dashboard');
                }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW CONFIRMATION MODAL */}
      {withdrawStep === 'confirm' && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => setWithdrawStep('idle')}>
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-badge-icon">🐖</div>
              <h3>Confirm Savings Withdrawal</h3>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ textAlign: 'center', fontSize: '0.95rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>
                Are you sure you want to withdraw <strong style={{ color: 'var(--text)' }}>${parseFloat(withdrawAmount).toFixed(2)} USDC</strong> from OinkVault?
              </p>

              <div className="oink-receipt">
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Withdraw Assets</span>
                  <span>${parseFloat(withdrawAmount).toFixed(2)} USDC</span>
                </div>

                <div className="oink-receipt-row highlight">
                  <span>Shares to Burn</span>
                  <span>-{parseFloat(withdrawSharesPreview).toFixed(2)} ybOINK</span>
                </div>

                <div className="oink-receipt-row total-row">
                  <span>Receiver Address</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {wallet ? `${wallet.signerAddress.slice(0, 6)}...${wallet.signerAddress.slice(-6)}` : '0x0'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.12)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                <ShieldCheck size={20} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  <strong>Direct Refund:</strong> The withdrawn USDC will be sent directly to your EOA signer wallet, and your ybOINK vault shares will be burned.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setWithdrawStep('idle')}>
                Cancel
              </button>
              <button className="btn btn-pink" onClick={handleConfirmWithdraw}>
                Confirm & Withdraw
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW SENDING MODAL */}
      {withdrawStep === 'sending' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div className="spinner pink" style={{ margin: '0 auto 1.5rem auto', width: '48px', height: '48px', borderWidth: '4px' }}></div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Executing Vault Withdrawal...
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <p style={{ color: 'var(--text)', fontWeight: 500 }}>Executing via Smart Account</p>
              <p>1. Preparing withdraw parameters...</p>
              <p>2. Burning ybOINK vault shares...</p>
              <p>3. Sending USDC to owner EOA...</p>
              <p style={{ marginTop: '0.5rem', fontStyle: 'italic', fontSize: '0.75rem' }}>Awaiting signature & block inclusion...</p>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW SUCCESS MODAL */}
      {withdrawStep === 'success' && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => { setWithdrawStep('idle'); setWithdrawAmount(''); }}>
              <X size={20} />
            </button>

            <div className="success-screen">
              <div className="success-badge" style={{ background: 'var(--success-glow)', color: 'var(--success)', border: '2px solid var(--success)' }}>
                <Check size={36} />
              </div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.5rem' }}>
                Withdrawal Successful!
              </h3>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                Your USDC savings have been withdrawn from OinkVault back to your EOA signer wallet.
              </p>

              <div className="oink-receipt" style={{ width: '100%', margin: '0.5rem 0' }}>
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Amount Withdrawn</span>
                  <span>${parseFloat(withdrawAmount).toFixed(2)} USDC</span>
                </div>

                <div className="oink-receipt-row highlight">
                  <span>ybOINK Burned</span>
                  <span>-{parseFloat(withdrawSharesPreview).toFixed(2)} ybOINK</span>
                </div>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--card-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Success (Block Confirmed)</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tx Hash</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {activeWithdrawHash.slice(0, 10)}...{activeWithdrawHash.slice(-10)}
                  </span>
                </div>

                <a
                  href={`https://explorer.testnet.arc.network/tx/${activeWithdrawHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tx-hash-link"
                  style={{ alignSelf: 'center' }}
                >
                  View on Arc Explorer <ArrowUpRight size={12} />
                </a>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1.25rem' }}
                onClick={() => {
                  setWithdrawStep('idle');
                  setWithdrawAmount('');
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
