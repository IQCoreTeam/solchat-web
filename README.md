# SolChat Web

A production-ready, decentralized messaging application built on Solana blockchain. This is the Next.js web version of SolChat, supporting Solana wallet extensions like Phantom, Solflare, and more.

## Features

✨ **All Mobile App Features**:
- ✅ Decentralized, on-chain messaging via IQ Protocol
- ✅ End-to-end encryption with Hanlock
- ✅ Real-time message subscriptions
- ✅ Create and join chat rooms
- ✅ Send/receive SOL and BONK tokens
- ✅ Account management with balance display
- ✅ Terminal-style UI interface
- ✅ Multi-wallet support (Phantom, Solflare, Torus, Ledger)
- ✅ Message color customization
- ✅ Command-line interface for power users
- ✅ Devnet airdrop support
- ✅ **Mobile wallet support** (Phantom mobile, Solflare mobile)
- ✅ **Solana Saga/Seeker phone optimized**
- ✅ **Responsive design** for all screen sizes

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Blockchain**: Solana Web3.js
- **Wallet Adapter**: Solana Wallet Adapter
- **State Management**: TanStack React Query + React Context
- **Encryption**: Hanlock
- **Storage**: IQ Protocol (on-chain)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Solana wallet extension (Phantom recommended)
- Devnet SOL for testing

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Run development server
npm run dev

# Open http://localhost:3000
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

The app is pre-configured with Devnet endpoints. To customize, create a `.env.local` file:

```env
NEXT_PUBLIC_IQ_BACKEND_HOST=https://iq-testbackend-381334931214.asia-northeast3.run.app
NEXT_PUBLIC_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

## Usage

### Connecting Wallet

**Desktop:**
1. Click "Select Wallet" in the navigation bar
2. Choose your preferred wallet (Phantom, Solflare, etc.)
3. Approve the connection in your wallet extension

**Mobile (Phantom/Solflare In-App Browser):**
1. Open Phantom or Solflare mobile app
2. Tap the browser/explore icon (🔍)
3. Navigate to your SolChat URL
4. Tap "Select Wallet" and approve connection
5. The app will automatically detect your mobile wallet!

**Solana Saga/Seeker Phones:**
1. Open the website in any browser
2. The wallet will be automatically injected
3. Click "Select Wallet" to connect
4. Enjoy seamless Web3 experience!

### Chat Features

Navigate to `/chat` to access the messaging interface.

**Main Menu**:
```
1 - Create/Search for a room
2 - Enter friend's room (via PDA)
3 - Enter Playground (test mode)
```

**Available Commands**:
```
/help                    - Show help message
/clear                   - Clear screen
/color [color]           - Change message color (blue/red/green/yellow)
/pw [key]                - Set encryption key
/pw off                  - Disable encryption
/balance                 - Check wallet balance and tokens
/sendbonk [addr] [amt]   - Send BONK tokens
/leave                   - Exit current chat room
```

### Account Management

Navigate to `/account` to:
- View SOL and token balances
- Send SOL to other addresses
- Request devnet airdrops
- View all token accounts

## Architecture

### IQ Protocol Integration

SolChat uses the IQ Protocol to store messages permanently on Solana:

1. **Message Writing**: Messages are chunked and stored in Solana transactions
2. **Message Reading**: Historical messages fetched via transaction signatures
3. **Real-time Updates**: WebSocket subscription to account logs for live messages
4. **Data Integrity**: Merkle root verification for multi-chunk messages

### Wallet Integration

Supports all standard Solana wallet adapters:
- Phantom
- Solflare
- Torus
- Ledger

### Encryption

Optional end-to-end encryption using Hanlock:
- User sets encryption key per session
- Messages encrypted before sending to chain
- Automatic decryption on receive (if key is set)

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

## Security Considerations

- **Wallet Security**: Never share your private keys
- **Encryption**: Use strong encryption keys for sensitive messages
- **Devnet Only**: This version runs on Solana Devnet (test network)
- **Audit**: This is demonstration software - audit before production use

## Troubleshooting

### Wallet Connection Issues

- Ensure wallet extension is installed and unlocked
- Check that you're on the correct network (Devnet)
- Clear browser cache and reload

### Transaction Failures

- Ensure sufficient SOL balance for fees
- Check RPC endpoint is responding
- Verify network conditions

## License

MIT License

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Solana](https://solana.com/)
- Wallet integration via [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)
- Encryption by [Hanlock](https://github.com/hanlock-kr/hanlock)
- Based on the SolChat mobile app

---

**Built with ❤️ on Solana**
# solchat-web
