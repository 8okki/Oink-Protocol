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
  Info
} from 'lucide-react';
import { 
  getOrCreateEOA, 
  initBiconomyAccount, 
  fetchBalances, 
  calculateRoundUp, 
  resetEOA
} from './utils/web3';
import type { WalletDetails } from './utils/web3';

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

// const MERCHANT_ADDRESS = "0x88ea307D53b70868a8600C6757b1f13b63D787b2";
const DEFAULT_VAULT_ADDRESS = "0x012B548bF287413d96924d55b871c261eCFA011A";

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'merchant' | 'settings'>('dashboard');
  
  // Wallet State
  const [wallet, setWallet] = useState<WalletDetails | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<boolean>(true);
  const [balances, setBalances] = useState<{ eth: string; usdc: string }>({ eth: '0.00', usdc: '0.00' });
  const [vaultBalance, setVaultBalance] = useState<number>(() => {
    return parseFloat(localStorage.getItem('oink_vault_balance') || '24.50');
  });
  const [copiedText, setCopiedText] = useState<string>('');
  const [isRefreshingBalances, setIsRefreshingBalances] = useState<boolean>(false);

  // Settings State
  const [oinkPolicyEnabled, setOinkPolicyEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('oink_policy_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [oinkPolicy, setOinkPolicy] = useState<string>(() => {
    return localStorage.getItem('oink_policy') || 'nearest-1';
  });
  const [vaultAddress, setVaultAddress] = useState<string>(() => {
    return localStorage.getItem('oink_vault_address') || DEFAULT_VAULT_ADDRESS;
  });

  // Faucet state
  const [faucetLoading, setFaucetLoading] = useState<boolean>(false);

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
    localStorage.setItem('oink_vault_balance', String(vaultBalance));
  }, [vaultBalance]);

  useEffect(() => {
    localStorage.setItem('oink_transactions', JSON.stringify(transactions));
  }, [transactions]);

  const loadWallet = async (pkey: string) => {
    setLoadingWallet(true);
    const details = await initBiconomyAccount(pkey);
    setWallet(details);
    
    // Fetch balances
    const bal = await fetchBalances(details.smartAccountAddress, details.isSimulated);
    setBalances(bal);
    setLoadingWallet(false);
  };

  const handleResetWallet = async () => {
    if (window.confirm("Are you sure you want to generate a new mock EOA? Your old private key and local balances will be reset.")) {
      const newPkey = resetEOA();
      localStorage.removeItem('oink_mock_eth');
      localStorage.removeItem('oink_mock_usdc');
      setVaultBalance(24.50);
      await loadWallet(newPkey);
    }
  };

  const handleRefreshBalances = async () => {
    if (!wallet) return;
    setIsRefreshingBalances(true);
    const bal = await fetchBalances(wallet.smartAccountAddress, wallet.isSimulated);
    setBalances(bal);
    setIsRefreshingBalances(false);
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(''), 2000);
  };

  const triggerFaucet = async () => {
    if (!wallet) return;
    setFaucetLoading(true);
    // Simulating faucet funding delay
    await new Promise(r => setTimeout(r, 1200));

    const currentUsdc = parseFloat(balances.usdc);
    const currentEth = parseFloat(balances.eth);
    
    const newUsdc = (currentUsdc + 100.00).toFixed(2);
    const newEth = (currentEth + 0.05).toFixed(4);

    localStorage.setItem('oink_mock_usdc', newUsdc);
    localStorage.setItem('oink_mock_eth', newEth);

    setBalances({ usdc: newUsdc, eth: newEth });
    setFaucetLoading(false);
    
    // Log faucet transaction
    const newTx: Transaction = {
      id: `faucet-${Date.now()}`,
      type: 'purchase',
      title: 'USDC & ETH Faucet Refill',
      amount: 100.00,
      roundup: 0,
      timestamp: new Date().toISOString(),
      status: 'success',
      txHash: '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')
    };
    setTransactions(prev => [newTx, ...prev]);
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
    
    // Check if user has enough USDC
    const userUsdc = parseFloat(balances.usdc);
    if (userUsdc < checkoutTotal) {
      alert(`Insufficient USDC balance! You have $${userUsdc.toFixed(2)} but this transaction requires $${checkoutTotal.toFixed(2)}. Click 'Refill Faucet' on the Dashboard tab.`);
      return;
    }

    if (oinkPolicyEnabled && checkoutRoundup > 0) {
      setCheckoutStep('confirm');
    } else {
      // Execute directly if no round-up or policy disabled
      executeMockTransaction(checkoutPrice, 0, checkoutPrice);
    }
  };

  const handleConfirmOink = () => {
    setCheckoutStep('sending');
    executeMockTransaction(checkoutPrice, checkoutRoundup, checkoutTotal);
  };

  const executeMockTransaction = async (price: number, roundup: number, total: number) => {
    // Simulate smart account txn signature & execution delay
    await new Promise(r => setTimeout(r, 2200));

    // Deduct USDC balance
    const currentUsdc = parseFloat(balances.usdc);
    const newUsdc = (currentUsdc - total).toFixed(2);
    localStorage.setItem('oink_mock_usdc', newUsdc);

    // If Oink is enabled, add to vault
    if (oinkPolicyEnabled && roundup > 0) {
      const newVault = vaultBalance + roundup;
      setVaultBalance(newVault);
      localStorage.setItem('oink_vault_balance', newVault.toFixed(2));
    }

    // Update state balance
    setBalances(prev => ({ ...prev, usdc: newUsdc }));

    const txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');

    // Add transactions to history
    const mainTx: Transaction = {
      id: `tx-m-${Date.now()}`,
      type: 'purchase',
      title: selectedItem ? `${selectedItem.name} Purchase` : 'Merchant Payment',
      amount: price,
      roundup: roundup,
      timestamp: new Date().toISOString(),
      status: 'success',
      txHash: txHash
    };

    let newTxs = [mainTx];

    if (oinkPolicyEnabled && roundup > 0) {
      const savingsTx: Transaction = {
        id: `tx-s-${Date.now()}`,
        type: 'savings',
        title: 'Oink Round-Up Savings',
        amount: roundup,
        roundup: 0,
        timestamp: new Date().toISOString(),
        status: 'success',
        txHash: txHash
      };
      newTxs.push(savingsTx);
    }

    setTransactions(prev => [...newTxs, ...prev]);
    setActiveTxResult({
      merchantAmount: price,
      roundupAmount: roundup,
      totalAmount: total,
      txHash: txHash
    });
    setCheckoutStep('success');

    // Clean selections
    setSelectedItem(null);
    setCustomAmount('');
  };

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
            <span>Smart Dashboard</span>
          </div>
          
          <div 
            className={`nav-link ${activeTab === 'merchant' ? 'active' : ''}`}
            onClick={() => setActiveTab('merchant')}
          >
            <ShoppingBag size={20} />
            <span>Mock Merchant</span>
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
            <span>Base Sepolia</span>
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
          </div>
          
          <div className="header-actions">
            {wallet && (
              <div className={`connection-pill ${wallet.isSimulated ? '' : 'connected'}`}>
                <span className="connection-dot"></span>
                <span>{wallet.isSimulated ? 'Demo Mode' : 'Oink Smart Wallet'}</span>
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
                <div className="glass-card glow-primary wallet-conn-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldCheck color="var(--primary)" size={24} />
                        Oink Smart Wallet
                      </h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Secure, gas-optimized smart piggy bank wallet.
                      </p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn-pink btn-sm" onClick={triggerFaucet} disabled={faucetLoading}>
                        <Coins size={14} />
                        {faucetLoading ? 'Funding...' : 'Refill Faucet ($100 USDC)'}
                      </button>
                      <button className="btn btn-secondary btn-sm btn-danger" onClick={handleResetWallet}>
                        Reset Key
                      </button>
                    </div>
                  </div>

                  <div className="wallet-connected-grid">
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
                        <span className="detail-value" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)', borderColor: 'rgba(139, 92, 246, 0.2)', borderWidth: '1px', borderStyle: 'solid' }}>
                          Base Sepolia (Chain 84532)
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
                </div>

                {/* Balances Section */}
                <div className="balance-card-grid">
                  <div className="glass-card glow-pink">
                    <div className="balance-item">
                      <div className="balance-header">
                        <span>Oink Vault Savings</span>
                        <PiggyBank size={18} color="var(--secondary)" />
                      </div>
                      <div className="balance-amount highlight-pink">
                        ${vaultBalance.toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>USDC</span>
                      </div>
                      <div className="balance-footer">
                        Rerouted from round-up transactions
                      </div>
                    </div>
                  </div>

                  <div className="glass-card">
                    <div className="balance-item">
                      <div className="balance-header">
                        <span>USDC Balance</span>
                        <Coins size={18} color="#2775ca" />
                      </div>
                      <div className="balance-amount">
                        ${parseFloat(balances.usdc).toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>USDC</span>
                      </div>
                      <div className="balance-footer">
                        Available for payments & checkout
                      </div>
                    </div>
                  </div>

                  <div className="glass-card">
                    <div className="balance-item">
                      <div className="balance-header">
                        <span>Gas Token Balance</span>
                        <WalletIcon size={18} color="var(--primary)" />
                      </div>
                      <div className="balance-amount">
                        {balances.eth} <span style={{ fontSize: '1rem', fontWeight: 500 }}>ETH</span>
                      </div>
                      <div className="balance-footer">
                        Used for transaction gas fees
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Row - Policy Summary & Tx History */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem', flexWrap: 'wrap' }}>
                  
                  {/* Left: Policy Status */}
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Oink Round-Up Status</h3>
                    
                    <div className="switch-control" style={{ background: 'rgba(255,255,255,0.01)' }}>
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

                    <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', border: '1px solid var(--card-border)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>ACTIVE POLICY TYPE</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff', textTransform: 'capitalize' }}>
                          {oinkPolicy.replace('-', ' ')}
                        </span>
                        <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('settings')}>
                          <Sliders size={12} />
                          Configure
                        </button>
                      </div>
                    </div>

                    <div className="roundup-preview-alert" style={{ marginTop: 'auto', background: 'rgba(139, 92, 246, 0.04)', borderColor: 'rgba(139, 92, 246, 0.15)' }}>
                      <Info size={16} className="icon" style={{ color: 'var(--primary)' }} />
                      <div className="roundup-preview-text">
                        <div className="roundup-preview-title" style={{ color: 'var(--primary)' }}>Round-Up Routing</div>
                        Your spare change transfers are batched atomically. No double signature required.
                      </div>
                    </div>
                  </div>

                  {/* Right: Tx History */}
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

                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', color: '#fff' }}>Select an Item to Purchase</h3>
                    
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
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', color: 'white' }}>
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
              <div className="tab-content">
                <div className="glass-card settings-grid">
                  
                  {/* Left Column: Switch & Presets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', color: 'white' }}>
                      Oink Round-Up Rules
                    </h3>

                    {/* Enable Toggle */}
                    <div className="switch-control">
                      <div className="switch-label">
                        <span className="switch-title" style={{ fontSize: '1.05rem' }}>Enable Automatic Round-ups</span>
                        <span className="switch-desc">Collect spare change from all USDC transaction payments</span>
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
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem', color: 'white' }}>
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
              <div className="modal-badge-icon">🐖</div>
              <h3>Confirm transaction with Oink Round-up</h3>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ textAlign: 'center', fontSize: '0.95rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>
                Confirm transaction of <strong style={{ color: 'white' }}>${checkoutPrice.toFixed(2)} USDC</strong> with an Oink round-up of <strong style={{ color: 'var(--secondary)' }}>${checkoutRoundup.toFixed(2)} USDC</strong>?
              </p>

              <div className="oink-receipt">
                <div className="oink-receipt-row">
                  <span style={{ color: 'var(--text-muted)' }}>Purchase Amount</span>
                  <span>${checkoutPrice.toFixed(2)} USDC</span>
                </div>
                
                <div className="oink-receipt-row highlight">
                  <span>Oink Round-Up</span>
                  <span>+${checkoutRoundup.toFixed(2)} USDC</span>
                </div>

                <div className="oink-receipt-row total-row">
                  <span>Total Debit</span>
                  <span>${checkoutTotal.toFixed(2)} USDC</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.12)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                <ShieldCheck size={20} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  <strong>Batched Transaction:</strong> Both actions are signed and executed in a single secure atomic bundle.
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
              <p style={{ color: '#fff', fontWeight: 500 }}>Batching transactions together</p>
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
              
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 700, color: 'white', marginTop: '0.5rem' }}>
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
                  href={`https://sepolia.basescan.org/tx/${activeTxResult.txHash}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="tx-hash-link"
                  style={{ alignSelf: 'center' }}
                >
                  View on Basescan <ArrowUpRight size={12} />
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

    </div>
  );
}
