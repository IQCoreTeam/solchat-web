# SolChat Mobile Guide

Complete guide for using SolChat on mobile devices, including Phantom mobile browser and Solana Saga/Seeker phones.

## 📱 Supported Mobile Platforms

### ✅ Fully Supported
- **Phantom Mobile In-App Browser** (iOS & Android)
- **Solflare Mobile In-App Browser** (iOS & Android)
- **Solana Saga Phone** (Native wallet integration)
- **Solana Seeker Phone** (Native wallet integration)

### ⚠️ Partially Supported
- **Standard Mobile Browsers** (Chrome, Safari, etc.) - Requires WalletConnect or similar

---

## 🎯 Quick Start Guide

### Option 1: Phantom Mobile Browser (Recommended)

1. **Open Phantom App**
   - Launch the Phantom app on your mobile device
   - Make sure you have some Devnet SOL for testing

2. **Access Browser**
   - Tap the **Explore** icon (🔍) at the bottom
   - Or tap the browser icon in the app

3. **Navigate to SolChat**
   - Enter your SolChat URL in the address bar
   - Example: `https://your-solchat-url.com`
   - Or search for it if bookmarked

4. **Connect Wallet**
   - The app will automatically detect Phantom
   - You'll see a green success banner
   - Tap **"Select Wallet"** button
   - Choose **Phantom** from the list
   - Approve the connection

5. **Start Using SolChat**
   - Go to the Chat tab
   - Create or join a room
   - Send messages on-chain!

---

### Option 2: Solflare Mobile Browser

1. **Open Solflare App**
   - Launch Solflare on your device
   - Ensure you have Devnet SOL

2. **Access Browser**
   - Tap the browser icon
   - Navigate to SolChat URL

3. **Connect**
   - The app will detect Solflare automatically
   - Tap "Select Wallet" and approve

4. **Use SolChat**
   - All features work the same as desktop!

---

### Option 3: Solana Saga/Seeker Phone

**Native Integration** - The easiest way!

1. **Open Any Browser**
   - Chrome, Brave, or default browser
   - Navigate to SolChat URL

2. **Automatic Detection**
   - Your phone's Seed Vault wallet is automatically detected
   - No need to open a separate wallet app!

3. **Connect**
   - Tap "Select Wallet"
   - Choose your preferred wallet (Solflare is pre-installed)
   - Approve with fingerprint or PIN

4. **Seamless Experience**
   - Hardware-backed security
   - Fast transaction signing
   - Native Web3 integration

---

## 🔐 Security Tips for Mobile

### ✅ Best Practices

1. **Use In-App Browsers**
   - Always use Phantom/Solflare's built-in browser
   - These browsers provide the most secure connection

2. **Verify URLs**
   - Make sure you're on the correct SolChat domain
   - Look for HTTPS and valid SSL certificate

3. **Check Transactions**
   - Always review transaction details before approving
   - Verify amounts and recipient addresses

4. **Keep Wallet Updated**
   - Update Phantom/Solflare regularly
   - Keep your device OS updated

### ❌ What to Avoid

1. **Don't Share Private Keys**
   - Never enter your seed phrase in SolChat
   - SolChat never asks for private keys

2. **Avoid Public WiFi**
   - Use mobile data or secure WiFi
   - Consider using a VPN

3. **Don't Screenshot Recovery Phrases**
   - Store them securely offline
   - Never upload to cloud services

---

## 🎮 Mobile-Specific Features

### Touch-Optimized UI

- **Larger Touch Targets**: Buttons are sized for fingers, not mouse cursors
- **Mobile-Friendly Navigation**: Collapsible menu on smaller screens
- **Responsive Terminal**: Chat interface adapts to screen size
- **Virtual Keyboard Support**: Works with on-screen keyboards

### Mobile Commands

All desktop commands work on mobile:

```
/help                    - Show help (touch-friendly menu)
/clear                   - Clear screen
/color [color]           - Change message color
/pw [key]                - Set encryption key
/balance                 - Check balances
/sendbonk [addr] [amt]   - Send BONK tokens
/leave                   - Exit chat
```

### Mobile Gestures

- **Tap**: Select options and enter chat
- **Swipe**: Scroll through chat history
- **Long Press**: Copy addresses/transaction IDs

---

## 🐛 Troubleshooting

### Wallet Not Detected

**Problem**: Green banner doesn't appear, wallet not found

**Solutions**:
1. Make sure you're using the **in-app browser** (not Chrome/Safari directly)
2. Close and reopen the wallet app
3. Clear browser cache in wallet settings
4. Try force-closing the wallet app

### Connection Failed

**Problem**: "Connect Wallet" button doesn't work

**Solutions**:
1. Refresh the page
2. Check internet connection
3. Verify you're on Devnet (Settings → Network)
4. Update wallet app to latest version

### Transactions Failing

**Problem**: Messages won't send, transactions fail

**Solutions**:
1. Check SOL balance (need ~0.01 SOL for fees)
2. Request airdrop: Go to Account → Request Airdrop
3. Wait a few seconds between transactions
4. Check Solana network status

### Screen Layout Issues

**Problem**: UI elements overlapping or cut off

**Solutions**:
1. Rotate to portrait mode
2. Refresh the page
3. Clear browser cache
4. Update wallet app

### Keyboard Covering Input

**Problem**: Virtual keyboard blocks chat input

**Solutions**:
1. Scroll up slightly before typing
2. Use landscape mode for more space
3. Close keyboard between messages (check mark on keyboard)

---

## 📊 Performance Tips

### Optimize for Mobile

1. **Use WiFi When Possible**
   - Faster transaction confirmations
   - Better real-time message sync

2. **Keep App in Foreground**
   - Mobile browsers may pause WebSocket connections in background
   - Keep SolChat tab active for real-time updates

3. **Limit Chat History**
   - Large message histories may slow down on older devices
   - Use `/clear` command periodically

4. **Close Other Apps**
   - Free up RAM for better performance
   - Especially important for encryption operations

---

## 🎯 Solana Saga/Seeker Specific

### Hardware Features

**Seed Vault Integration**
- Biometric authentication (fingerprint)
- Hardware-backed key storage
- Secure transaction signing

**How to Use:**
1. Transaction appears on screen
2. Double-tap power button (or use fingerprint)
3. Review transaction details
4. Confirm with biometric authentication

### Optimized Performance

- **Faster Signing**: Hardware acceleration
- **Better Battery**: Optimized Solana integration
- **Native Support**: No need for separate wallet apps

### Saga/Seeker Settings

1. **Enable Developer Mode** (for Devnet)
   - Settings → Solana → Network → Devnet

2. **Configure Wallet**
   - Solflare is pre-installed
   - Or install Phantom from dApp store

3. **Manage Seed Vault**
   - Settings → Security → Seed Vault
   - Set up biometric authentication

---

## 🌐 Network Configuration

### Devnet (Default)

SolChat currently runs on **Solana Devnet** for testing.

**To Get Devnet SOL:**
1. Go to Account tab
2. Tap "Request Airdrop"
3. Receive 1 SOL instantly
4. Repeat as needed (max ~10 SOL)

**Or use Solana Faucet:**
- Visit: https://faucet.solana.com
- Paste your wallet address
- Request airdrop

### Mainnet (Future)

When SolChat launches on Mainnet:
- Switch wallet network to Mainnet
- Real SOL required for transactions
- Messages cost ~0.000005 SOL

---

## ✨ Mobile-Exclusive Tips

### Chat Like a Pro

1. **Use Shortcuts**
   - Type `1`, `2`, or `3` for main menu options
   - Save common commands as keyboard shortcuts

2. **Voice Input** (if supported)
   - Use voice-to-text for messages
   - Great for longer messages

3. **Copy with Ease**
   - Long press on addresses to copy
   - Transaction IDs are tap-to-copy

4. **Share Rooms**
   - Copy room PDA
   - Share via messaging apps
   - Friends can join instantly

### Battery Saving

- **Disable Auto-Connect**: Turn off in wallet settings when not using
- **Close When Done**: Don't leave SolChat running in background
- **Reduce Animations**: Enable "Reduce Motion" in device settings

---

## 🔗 Useful Links

- **Phantom Mobile**: https://phantom.app/download
- **Solflare Mobile**: https://solflare.com/download
- **Solana Mobile Docs**: https://docs.solanamobile.com
- **Saga Phone**: https://solanamobile.com/saga
- **Seeker Phone**: https://solanamobile.com/seeker
- **Solana Faucet**: https://faucet.solana.com

---

## 💬 Getting Help

### In-App Support

1. Type `/help` in chat for command list
2. Check banner messages for tips
3. Review transaction history in wallet app

### Community Support

- Check SolChat documentation
- Ask in Solana Discord
- Report issues on GitHub

---

## 🎉 Success!

You're now ready to use SolChat on mobile!

**Next Steps:**
1. Connect your wallet
2. Request some Devnet SOL
3. Create your first chat room
4. Invite friends with room PDA
5. Experience true decentralized messaging!

**Remember**: All messages are stored permanently on Solana blockchain. This is real Web3! 🚀

---

*Built with ❤️ for Solana Mobile*
