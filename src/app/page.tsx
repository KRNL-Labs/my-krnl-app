"use client";

import { useState, useEffect } from 'react';
import { ethers } from 'krnl-sdk';
import { abi as contractAbi, CONTRACT_ADDRESS, KERNEL_ID } from '../components/kernels/onchain/337/config';
import { executeKrnl, callContractProtectedFunction } from '../components/kernels/onchain/337';
import Image from 'next/image';

// Add TypeScript declaration for ethereum property on window
declare global {
  interface Window {
    ethereum?: any;
  }
}

const hexAdapter = (decimal: number) => {
  return ethers.toBeHex(decimal);
}

// Network configurations
const NETWORKS = {
  sepolia: {
    chainId: hexAdapter(11155111), // 11155111 in hex
    chainName: 'Sepolia',
    nativeCurrency: {
      name: 'Sepolia Ether',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: ['https://eth-sepolia.public.blastapi.io'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    iconColor: '#0052FF',
    icon: './sepolia.svg'
  },
  // optimism: {
  //   chainId: hexAdapter(11155420), // 11155420 in hex
  //   chainName: 'Optimism Sepolia Testnet',
  //   nativeCurrency: {
  //     name: 'Optimism Ether',
  //     symbol: 'ETH',
  //     decimals: 18
  //   },
  //   rpcUrls: ['https://sepolia.optimism.io'],
  //   blockExplorerUrls: ['https://sepolia-optimism.etherscan.io'],
  //   iconColor: '#0052FF',
  //   icon: './optimism.svg'
  // },
  // base: {
  //   chainId: hexAdapter(84532), // 84532 in hex
  //   chainName: 'Base Testnet',
  //   nativeCurrency: {
  //     name: 'Base Ether',
  //     symbol: 'ETH',
  //     decimals: 18
  //   },
  //   rpcUrls: ['https://sepolia.base.org'],
  //   blockExplorerUrls: ['https://sepolia.basescan.org'],
  //   iconColor: '#0052FF',
  //   icon: './base.svg'
  // }
};

export default function KrnlNextJSTemplate() {
  // State variables
  const [loading, setLoading] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string>('');
  const [transactionHash, setTransactionHash] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [response, setResponse] = useState<any>(null);
  const [eventData, setEventData] = useState<any>(null);
  const [step, setStep] = useState<string>('');
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('sepolia');
  const [networkSwitchPending, setNetworkSwitchPending] = useState(false);
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
  
  // Section loading states
  const [responseLoading, setResponseLoading] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);

  // Check if wallet is connected
  useEffect(() => {
    checkWalletConnection();
  }, []);

  // Setup event listener for contract events
  useEffect(() => {
    if (CONTRACT_ADDRESS && provider) {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, provider);
      
      // Listen for Broadcast events
      contract.on('Broadcast', (sender: string, data: bigint, message: string, event: any) => {
        console.log('Broadcast event received:', { sender, data, message });
        
        const processedData = Number(data.toString());
        
        setEventData({
          sender,
          data: processedData,
          message,
          blockNumber: event.blockNumber
        });
      });
      
      // Cleanup function
      return () => {
        contract.removeAllListeners('Broadcast');
      };
    }
  }, [provider]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#network-dropdown') && !target.closest('#network-button')) {
        setNetworkDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Check if wallet is already connected
  const checkWalletConnection = async () => {
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        // Get provider
        const web3Provider = new ethers.BrowserProvider(window.ethereum);
        setProvider(web3Provider);
        
        // Check if any accounts are already connected
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        
        if (accounts.length > 0) {
          const web3Signer = await web3Provider.getSigner();
          setSigner(web3Signer);
          setConnectedAddress(accounts[0]);
          setWalletConnected(true);
          
          // Check current network
          const network = await web3Provider.getNetwork();
          const chainIdHex = '0x' + network.chainId.toString(16);
          
          // Set the selected network based on the current chain ID
          for (const [networkName, networkConfig] of Object.entries(NETWORKS)) {
            if (networkConfig.chainId === chainIdHex) {
              setSelectedNetwork(networkName);
              break;
            }
          }
        }
      } catch (err) {
        console.error("Failed to check wallet connection:", err);
      }
    }
  };

  // Connect wallet using MetaMask or other providers
  const connectWallet = async () => {
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        setLoading(true);
        
        // Request accounts
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const web3Provider = new ethers.BrowserProvider(window.ethereum);
        const web3Signer = await web3Provider.getSigner();
        
        setProvider(web3Provider);
        setSigner(web3Signer);
        setConnectedAddress(accounts[0]);
        setWalletConnected(true);
        
        // Switch to the selected network after connecting
        await switchNetwork(selectedNetwork);
      } catch (err: any) {
        setError("Failed to connect wallet: " + err.message);
      } finally {
        setLoading(false);
      }
    } else {
      setError("Ethereum wallet not found. Please install MetaMask or another wallet.");
    }
  };
  
  // Disconnect wallet
  const disconnectWallet = () => {
    setWalletConnected(false);
    setConnectedAddress('');
    setSigner(null);
    setResponse(null);
    setEventData(null);
    setTransactionHash('');
    setError('');
  };
  
  // Switch to a different network
  const switchNetwork = async (networkName: string) => {
    if (!window.ethereum) {
      setError("Ethereum wallet not found");
      return;
    }
    
    try {
      setNetworkSwitchPending(true);
      
      const network = NETWORKS[networkName as keyof typeof NETWORKS];
      if (!network) {
        throw new Error(`Network configuration not found for ${networkName}`);
      }
      
      try {
        // Try to switch to the network
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: network.chainId }],
        });
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: network.chainId,
                chainName: network.chainName,
                nativeCurrency: network.nativeCurrency,
                rpcUrls: network.rpcUrls,
                blockExplorerUrls: network.blockExplorerUrls
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
      
      setSelectedNetwork(networkName);
      setNetworkDropdownOpen(false);
      
      // Refresh provider and signer after network switch
      if (walletConnected) {
        const web3Provider = new ethers.BrowserProvider(window.ethereum);
        const web3Signer = await web3Provider.getSigner();
        setProvider(web3Provider);
        setSigner(web3Signer);
      }
    } catch (err: any) {
      setError(`Failed to switch network: ${err.message}`);
    } finally {
      setNetworkSwitchPending(false);
    }
  };

  // Execute KRNL with wallet connection
  const executeKrnlWithWallet = async () => {
    try {
      setLoading(true);
      setResponseLoading(true);
      setTransactionLoading(false);
      setError('');
      setTransactionHash('');
      // Don't clear the response immediately to keep the section visible
      // Just mark it as loading
      setResponse({});
      setEventData(null);
      setStep('Preparing KRNL request...');
      
      if (!walletConnected || !signer) {
        throw new Error("Wallet not connected");
      }
      
      // Execute KRNL kernels using the imported function
      setStep('Calling KRNL node...');
      // Pass the connected address and kernel ID to the executeKrnl function
      const krnlPayload = await executeKrnl(connectedAddress, KERNEL_ID);
      console.log('KRNL Payload:', krnlPayload);
      
      setResponse(krnlPayload);
      setResponseLoading(false);
      setStep('KRNL response received');
      
      // Call smart contract with KRNL results
      if (CONTRACT_ADDRESS) {
        setTransactionLoading(true);
        setStep('Preparing transaction...');
        
        setStep('Sending transaction to contract...');
        // Pass the signer to the callContractProtectedFunction
        const txHash = await callContractProtectedFunction(krnlPayload, signer);
        setTransactionHash(txHash);
        
        setTransactionLoading(false);
        setStep('Transaction confirmed');
      }
      
      setLoading(false);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'An error occurred');
      setResponseLoading(false);
      setTransactionLoading(false);
      setLoading(false);
    }
  };

  // Get block explorer URL based on selected network
  const getBlockExplorerUrl = () => {
    const network = NETWORKS[selectedNetwork as keyof typeof NETWORKS];
    return network?.blockExplorerUrls[0] || 'https://sepolia.etherscan.io';
  };

  // Get network icon
  const getIcon = () => {
    return NETWORKS[selectedNetwork as keyof typeof NETWORKS]?.icon || './sepolia.svg';
  };

  // Get network name
  const getNetworkName = () => {
    return NETWORKS[selectedNetwork as keyof typeof NETWORKS]?.chainName || 'Sepolia';
  };

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Header with network selector and wallet button */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black bg-opacity-80 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Image src="/logo.svg" width={32} height={32} alt="Logo" className="inline-block" />
                <span className="text-white">KRNL</span>
                <span className="text-[#001EFE]">NextJS Template</span>
              </h1>
            </div>
            
            {/* Network selector and wallet button */}
            <div className="flex items-center space-x-4">
              {/* Network Selector Dropdown */}
              <div className="relative">
                <button
                  id="network-button"
                  onClick={() => setNetworkDropdownOpen(!networkDropdownOpen)}
                  className="flex items-center px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors"
                >
                  <div className="mr-2">
                    <Image src={getIcon()} width={24} height={24} alt="Network Icon" className="inline-block" />
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  {networkSwitchPending && (
                    <div className="animate-spin h-3 w-3 border border-white border-t-transparent rounded-full ml-2"></div>
                  )}
                </button>
                
                {networkDropdownOpen && (
                  <div 
                    id="network-dropdown"
                    className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-gray-900 ring-1 ring-black ring-opacity-5 py-1"
                  >
                    {Object.entries(NETWORKS).map(([networkName, network]) => (
                      <button
                        key={networkName}
                        onClick={() => switchNetwork(networkName)}
                        disabled={networkSwitchPending || selectedNetwork === networkName}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-800 flex items-center gap-2 ${
                          selectedNetwork === networkName ? 'bg-gray-800' : ''
                        }`}
                      >
                        <div className="flex-shrink-0 w-5 h-5">
                          <Image src={network.icon} width={20} height={20} alt={`${network.chainName} Icon`} className="inline-block" />
                        </div>
                        <span className="flex-grow">{network.chainName}</span>
                        {selectedNetwork === networkName && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Wallet Connect Button */}
              {!walletConnected ? (
                <button 
                  onClick={connectWallet}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg font-medium transition-all disabled:opacity-50 flex items-center bg-[#0052FF] hover:bg-[#0045DB]"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      <span>Connect Wallet</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="relative group">
                  <div className="flex items-center bg-gray-900 px-3 py-2 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-green-400 mr-2"></div>
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {connectedAddress.substring(0, 6)}...{connectedAddress.substring(connectedAddress.length - 4)}
                    </span>
                  </div>
                  <button 
                    onClick={disconnectWallet}
                    className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-red-600 bg-opacity-90 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-sm font-medium"
                  >
                    <span>Disconnect</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Build with <span className="text-[#001EFE]">KRNL</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Interact with your registered smart contract using this NextJS template.
            Connect your wallet, select a network, and execute the transaction using kOS.
          </p>
        </div>

        {/* Main card */}
        <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800 mb-8 overflow-hidden">
          {/* Card header */}
          <div className="bg-black px-6 py-4 border-b border-gray-800">
            <h3 className="text-xl font-semibold">KRNL Execution</h3>
          </div>
          
          {/* Card content */}
          <div className="p-6">
            {error && (
              <div className="mb-6 bg-red-900 bg-opacity-30 text-red-400 text-sm p-3 rounded-lg border border-red-900 flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}
            
            {walletConnected ? (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Kernel ID</label>
                    <div className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 flex items-center">
                      <span>{KERNEL_ID}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Contract Address</label>
                    <div className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 flex items-center">
                      <span className="truncate">{CONTRACT_ADDRESS}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center">
                  <button
                    onClick={executeKrnlWithWallet}
                    disabled={loading}
                    className="px-6 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 flex items-center justify-center bg-[#0052FF] hover:bg-[#0045DB]"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      'Execute KRNL'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 className="text-xl font-medium text-gray-300 mb-2">Wallet Not Connected</h3>
                <p className="text-gray-400 mb-6">Please connect your wallet to interact with kOS</p>
                <button 
                  onClick={connectWallet}
                  className="px-6 py-3 rounded-lg font-medium transition-all bg-[#0052FF] hover:bg-[#0045DB]"
                >
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Loading state - only show this for the initial loading before any sections appear */}
        {loading && !response && (
          <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800 mb-8 p-8">
            <div className="flex flex-col items-center justify-center py-6">
              <div className="relative">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#0052FF]"></div>
              </div>
              <div className="mt-4 text-lg font-medium">{step}</div>
              <div className="mt-8 max-w-md w-full">
                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full animate-pulse bg-[#0052FF]"
                    style={{ 
                      width: step.includes('confirmation') ? '90%' : 
                             step.includes('transaction') ? '70%' : 
                             step.includes('response') ? '50%' : 
                             step.includes('KRNL') ? '30%' : '10%' 
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Response section - show as soon as execution starts */}
        {response && (
          <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800 mb-8">
            <div className="bg-black px-6 py-4 border-b border-gray-800">
              <h3 className="text-xl font-semibold">Kernel Response</h3>
            </div>
            <div className="p-6">
              {responseLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#0052FF] mr-3"></div>
                  <span>Fetching kernel responses...</span>
                </div>
              ) : (
                <pre className="bg-gray-800 p-4 rounded-lg overflow-auto text-sm max-h-96">
                  {JSON.stringify(response, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Transaction section - show when response is available */}
        {response && CONTRACT_ADDRESS && (
          <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800 mb-8">
            <div className="bg-black px-6 py-4 border-b border-gray-800">
              <h3 className="text-xl font-semibold">Transaction</h3>
            </div>
            <div className="p-6">
              {transactionLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#0052FF] mr-3"></div>
                  <span>Processing transaction...</span>
                </div>
              ) : transactionHash ? (
                <div className="bg-gray-800 p-4 rounded-lg">
                  <p className="text-green-400 text-sm font-medium mb-2 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Transaction Submitted
                  </p>
                  <div className="flex items-center">
                    <span className="text-xs text-gray-400 mr-2">Tx Hash:</span>
                    <a 
                      href={`${getBlockExplorerUrl()}/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs hover:text-[#0052FF] break-all flex-1 truncate"
                    >
                      {transactionHash}
                    </a>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(transactionHash);
                        const btn = document.activeElement as HTMLButtonElement;
                        btn.querySelector('svg.copy-icon')?.classList.add('hidden');
                        btn.querySelector('svg.copied-icon')?.classList.remove('hidden');
                        setTimeout(() => {
                          btn.querySelector('svg.copy-icon')?.classList.remove('hidden');
                          btn.querySelector('svg.copied-icon')?.classList.add('hidden');
                        }, 1500);
                      }}
                      className="ml-2 p-1 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                      title="Copy to clipboard"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 copy-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 copied-icon hidden" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-400">
                  Waiting for transaction...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Event data section */}
        {eventData && (
          <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800">
            <div className="bg-black px-6 py-4 border-b border-gray-800">
              <h3 className="text-xl font-semibold">Decoded Response</h3>
            </div>
            <div className="p-6">
              <div className="bg-gray-800 p-4 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Sender:</p>
                    <p className="font-mono text-sm truncate">{eventData.sender}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Response:</p>
                    <p className="font-mono text-sm truncate">{eventData.data}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}