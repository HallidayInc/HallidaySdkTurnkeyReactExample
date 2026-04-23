# Halliday SDK Example with a Turnkey Wallet

Halliday Payments SDK integration example using a Turnkey wallet. This project uses the Vite React template and the Turnkey React SDK. To connect the Turnkey wallet to the app, Viem is used with the Turnkey React SDK.

### Keys

Get a Turnkey app ID: https://turnkey.com/

Get a Halliday API key: https://halliday.xyz/contact

### Run

Edit the `.env` files by supplanting the Turnkey and Halliday keys. See `.env.example` for details.

```
VITE_TURNKEY_ORGANIZATION_ID=_your_api_key_here_
VITE_TURNKEY_AUTH_PROXY_CONFIG_ID=_your_api_key_here_
VITE_HALLIDAY_API_KEY=_your_api_key_here_
```

Run the app using the command line:

```
npm install
npm run dev
```