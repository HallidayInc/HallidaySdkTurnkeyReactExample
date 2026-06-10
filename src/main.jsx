import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
window.Buffer = Buffer
import { TurnkeyProvider } from '@turnkey/react-wallet-kit'
import '@turnkey/react-wallet-kit/styles.css'
import App from './App.jsx'
import { DEFAULT_WALLET_NAME, DEFAULT_ETH_ACCOUNT } from './walletConfig.js'

const TURNKEY_ORGANIZATION_ID = import.meta.env.VITE_TURNKEY_ORGANIZATION_ID
const TURNKEY_AUTH_PROXY_CONFIG_ID = import.meta.env.VITE_TURNKEY_AUTH_PROXY_CONFIG_ID
const HALLIDAY_API_KEY = import.meta.env.VITE_HALLIDAY_API_KEY

if (
  !TURNKEY_ORGANIZATION_ID ||
  !TURNKEY_AUTH_PROXY_CONFIG_ID ||
  !HALLIDAY_API_KEY ||
  TURNKEY_ORGANIZATION_ID === '_your_turnkey_org_id_here_' ||
  TURNKEY_AUTH_PROXY_CONFIG_ID === '_your_auth_proxy_config_id_here_' ||
  HALLIDAY_API_KEY === '_your_api_key_here_'
) {
  alert('Error: Missing API keys. See .env file.')
}

const customWallet = {
  walletName: DEFAULT_WALLET_NAME,
  walletAccounts: [DEFAULT_ETH_ACCOUNT],
}

const turnkeyConfig = {
  organizationId: TURNKEY_ORGANIZATION_ID,
  authProxyConfigId: TURNKEY_AUTH_PROXY_CONFIG_ID,
  auth: {
    createSuborgParams: {
      passkeyAuth: {
        userName: 'Passkey User',
        customWallet,
      },
      emailOtpAuth: {
        userName: 'Email User',
        customWallet,
      },
    },
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TurnkeyProvider
      config={turnkeyConfig}
      callbacks={{
        onError: (error) => console.error('Turnkey error:', error),
      }}
    >
      <App />
    </TurnkeyProvider>
  </StrictMode>,
)
