import { useEffect, useRef, useState } from 'react'
import { useTurnkey, AuthState } from '@turnkey/react-wallet-kit'
import { createAccount } from '@turnkey/viem'
import {
  openHallidayPayments,
  openWithdraw,
  openActivity,
  initializeClient,
} from '@halliday-sdk/payments'
import {
  createWalletClient,
  createPublicClient,
  http,
  extractChain,
  decodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
} from 'viem'
import * as chains from 'viem/chains'
import { DEFAULT_WALLET_NAME, DEFAULT_ETH_ACCOUNT } from './walletConfig.js'
import './App.css'

const HALLIDAY_PUBLIC_API_KEY = import.meta.env.VITE_HALLIDAY_API_KEY

const tokens = [
  'base:0x',
  'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
]

initializeClient({
  apiKey: HALLIDAY_PUBLIC_API_KEY,
  outputs: tokens,
  onError: (error) => console.error('Halliday init error:', error),
})

// Halliday may route sendTransaction to any EVM chain it supports, so resolve
// the viem chain dynamically from the chainId Halliday passes in.
const getChainById = (chainId) =>
  extractChain({ chains: Object.values(chains), id: Number(chainId) })

// Try to decode a transaction as an ERC20 transfer. Returns null if it isn't
// one, or if decoding / metadata fetch fails — the caller falls back to a
// raw-transaction display.
const describeErc20Transfer = async (tx, publicClient) => {
  if (!tx.data || tx.data === '0x') return null
  let decoded
  try {
    decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data })
  } catch {
    return null
  }
  if (decoded.functionName !== 'transfer') return null
  const [recipient, rawAmount] = decoded.args
  try {
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({ address: tx.to, abi: erc20Abi, functionName: 'symbol' }),
      publicClient.readContract({ address: tx.to, abi: erc20Abi, functionName: 'decimals' }),
    ])
    return {
      tokenAddress: tx.to,
      symbol,
      decimals,
      recipient,
      amount: formatUnits(rawAmount, decimals),
    }
  } catch {
    return { tokenAddress: tx.to, recipient, amount: rawAmount.toString() }
  }
}

function FieldRow({ label, value }) {
  return (
    <div className="sig-field-row">
      <span className="sig-label">{label}</span>
      <span className="sig-value">{value}</span>
    </div>
  )
}

function TypedDataBody({ typedData }) {
  const { domain, primaryType, message } = typedData
  return (
    <>
      <section>
        <h3>Domain</h3>
        <pre>{JSON.stringify(domain, null, 2)}</pre>
      </section>
      <section>
        <h3>Primary type</h3>
        <pre>{primaryType}</pre>
      </section>
      <section>
        <h3>Message</h3>
        <pre>{JSON.stringify(message, null, 2)}</pre>
      </section>
    </>
  )
}

function MessageBody({ message }) {
  const display = typeof message === 'string' ? message : JSON.stringify(message, null, 2)
  return (
    <section>
      <h3>Message</h3>
      <pre>{display}</pre>
    </section>
  )
}

function TransactionBody({ tx, chain, erc20Transfer }) {
  const chainLabel = chain ? `${chain.name} (${chain.id})` : `Chain ID ${tx.chainId}`
  const nativeSymbol = chain?.nativeCurrency?.symbol ?? 'ETH'

  if (erc20Transfer) {
    const amountLabel = erc20Transfer.symbol
      ? `${erc20Transfer.amount} ${erc20Transfer.symbol}`
      : `${erc20Transfer.amount} (raw)`
    return (
      <section>
        <h3>Token transfer</h3>
        <div className="sig-field-group">
          <FieldRow label="Amount" value={amountLabel} />
          <FieldRow label="Recipient" value={erc20Transfer.recipient} />
          <FieldRow label="Token" value={erc20Transfer.tokenAddress} />
          <FieldRow label="Network" value={chainLabel} />
        </div>
      </section>
    )
  }

  const nativeValue = tx.value ? `${formatEther(BigInt(tx.value))} ${nativeSymbol}` : `0 ${nativeSymbol}`
  return (
    <section>
      <h3>Transaction</h3>
      <div className="sig-field-group">
        <FieldRow label="To" value={tx.to} />
        <FieldRow label="Value" value={nativeValue} />
        <FieldRow label="Network" value={chainLabel} />
        {tx.data && tx.data !== '0x' && (
          <FieldRow label="Data" value={`${tx.data.slice(0, 10)}… (${(tx.data.length - 2) / 2} bytes)`} />
        )}
      </div>
    </section>
  )
}

const MODAL_COPY = {
  transaction: {
    header: 'Turnkey Wallet Transaction Request',
    subtitle: 'Review the transaction below. Approving will submit it on-chain via your Turnkey embedded wallet.',
    Body: TransactionBody,
  },
  typedData: {
    header: 'Turnkey Wallet Signature Request',
    subtitle: 'Review the EIP-712 typed data below. Your Turnkey embedded wallet will produce this signature.',
    Body: TypedDataBody,
  },
  message: {
    header: 'Turnkey Wallet Signature Request',
    subtitle: 'Review the message below. Your Turnkey embedded wallet will produce this signature.',
    Body: MessageBody,
  },
}

function ApprovalModal({ request, onApprove, onDeny }) {
  const { header, subtitle, Body } = MODAL_COPY[request.kind]
  return (
    <div className="sig-modal-overlay" role="dialog" aria-modal="true">
      <div className="sig-modal">
        <h2>{header}</h2>
        <p className="sig-modal-subtitle">{subtitle}</p>

        <Body {...request} />

        <div className="sig-modal-actions">
          <button className="sig-deny" onClick={onDeny}>Reject</button>
          <button className="sig-approve" onClick={onApprove}>Approve</button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const {
    authState,
    handleLogin,
    logout,
    wallets,
    httpClient,
    session,
    createWallet,
    refreshWallets,
  } = useTurnkey()
  const [pendingRequest, setPendingRequest] = useState(null)
  const provisioningRef = useRef(false)

  const isAuthenticated = authState === AuthState.Authenticated
  const embeddedWallet = wallets.find((w) => w.source === 'embedded')
  const activeAddress = embeddedWallet?.accounts[0]?.address
  const enabled = isAuthenticated && !!activeAddress

  useEffect(() => {
    if (!isAuthenticated || embeddedWallet || provisioningRef.current) return
    provisioningRef.current = true
    ;(async () => {
      try {
        const fresh = await refreshWallets()
        if (fresh.some((w) => w.source === 'embedded')) return
        await createWallet({
          walletName: DEFAULT_WALLET_NAME,
          accounts: [DEFAULT_ETH_ACCOUNT],
        })
        await refreshWallets()
      } catch (error) {
        console.error('Failed to provision embedded wallet:', error)
      } finally {
        provisioningRef.current = false
      }
    })()
  }, [isAuthenticated, embeddedWallet, createWallet, refreshWallets])

  const requestApproval = (request) =>
    new Promise((resolve, reject) => {
      setPendingRequest({ ...request, resolve, reject })
    })

  const handleApprove = () => {
    pendingRequest.resolve()
    setPendingRequest(null)
  }

  const handleDeny = () => {
    pendingRequest.reject(new Error('User rejected request'))
    setPendingRequest(null)
  }

  const buildWalletActions = async () => {
    const turnkeyAccount = await createAccount({
      client: httpClient,
      organizationId: session.organizationId,
      signWith: activeAddress,
    })

    const clientCache = new Map()
    const getClients = (chainId) => {
      if (!clientCache.has(chainId)) {
        const chain = getChainById(chainId)
        if (!chain) throw new Error(`Unsupported chainId: ${chainId}`)
        clientCache.set(chainId, {
          wallet: createWalletClient({ account: turnkeyAccount, chain, transport: http() }),
          publicClient: createPublicClient({ chain, transport: http() }),
          chain,
        })
      }
      return clientCache.get(chainId)
    }

    return {
      getAddress: async () => activeAddress,
      signMessage: async ({ message }) => {
        await requestApproval({ kind: 'message', message })
        return turnkeyAccount.signMessage({ message })
      },
      signTypedData: async ({ typedData }) => {
        const parsed = JSON.parse(typedData)
        await requestApproval({ kind: 'typedData', typedData: parsed })
        return turnkeyAccount.signTypedData(parsed)
      },
      sendTransaction: async (tx) => {
        const { wallet, publicClient, chain } = getClients(tx.chainId)
        const erc20Transfer = await describeErc20Transfer(tx, publicClient)
        await requestApproval({ kind: 'transaction', tx, chain, erc20Transfer })
        const hash = await wallet.sendTransaction({
          account: turnkeyAccount,
          to: tx.to,
          value: tx.value,
          data: tx.data,
          gas: tx.gasLimit,
          nonce: tx.nonce,
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        return { ...receipt, blockNumber: Number(receipt.blockNumber), rawReceipt: receipt }
      },
    }
  }

  const onConnect = () => (isAuthenticated ? logout() : handleLogin())

  const onDeposit = async () => {
    if (!enabled) return
    const userWallet = await buildWalletActions()
    openHallidayPayments({
      userWallet,
      destinationAddress: activeAddress,
      onError: (error) => console.log('Halliday widget error:', error),
    })
  }

  const onWithdraw = async () => {
    if (!enabled) return
    const userWallet = await buildWalletActions()
    openWithdraw({
      withdrawInputs: tokens,
      withdrawFunder: userWallet,
    })
  }

  // Note this cannot be properly called until a userWallet, funder or owner are
  // provided to initializeClient or openHallidayPayments
  const onActivity = () => openActivity()

  return (
    <div className="halliday-container">
      <h1>Halliday SDK Turnkey Example</h1>
      <button onClick={onConnect}>{isAuthenticated ? 'Disconnect' : 'Connect'}</button>
      <button disabled={!enabled} onClick={onDeposit}>Deposit with Halliday</button>
      <button disabled={!enabled} onClick={onWithdraw}>Withdraw</button>
      <button disabled={!enabled} onClick={onActivity}>Activity</button>
      {activeAddress && <p>Wallet: {activeAddress}</p>}

      {pendingRequest && (
        <ApprovalModal
          request={pendingRequest}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}
    </div>
  )
}

export default App
