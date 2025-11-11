# SolChat Web - Deployment Guide

Quick deployment guide for SolChat Web with mobile wallet support.

## 🚀 Quick Deploy

### Vercel (Recommended)

```bash
npm i -g vercel
cd solchat-web
vercel
```

Follow prompts and your app will be live!

### Environment Variables

Add these in Vercel dashboard or .env.local:

```env
NEXT_PUBLIC_IQ_BACKEND_HOST=https://iq-testbackend-381334931214.asia-northeast3.run.app
NEXT_PUBLIC_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

## 📱 Mobile Testing

### Test on Phantom Mobile

1. Deploy to Vercel (gets HTTPS URL)
2. Open Phantom mobile app
3. Navigate to your deployment URL
4. Test wallet connection

### Test on Saga/Seeker

1. Open Chrome on device
2. Navigate to deployment URL
3. Connect wallet seamlessly

## ✅ Pre-Deployment Checklist

- [ ] Build succeeds: `npm run build`
- [ ] Environment variables configured
- [ ] RPC endpoint working
- [ ] HTTPS enabled (required for wallets)
- [ ] Mobile responsive design tested
- [ ] Wallet connections tested

## 🔒 Security

- Never commit .env files
- Use separate RPC keys for prod
- Enable rate limiting on RPC
- Monitor transaction volume

## 📊 Production Recommendations

- Use paid RPC provider (Helius, QuickNode)
- Enable error tracking (Sentry)
- Add analytics (Plausible, Fathom)
- Setup monitoring alerts
- Regular security audits

Done! Your SolChat is now mobile-ready! 🎉
