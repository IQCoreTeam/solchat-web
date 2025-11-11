import Link from 'next/link';
import { Nav } from '@/components/layout/nav';
import { MobileWalletBanner } from '@/components/mobile/mobile-wallet-banner';

export default function Home() {
  return (
    <div className="min-h-screen bg-black">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <MobileWalletBanner />
      </div>

      <main className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="mb-8">
            <pre className="text-green-400 font-mono text-sm inline-block">
{`
╔══════════════════════════════════════════════════════════════╗
║                      SOLCHAT v1.0                          ║
║               Decentralized Chat on Solana                 ║
╚══════════════════════════════════════════════════════════════╝
`}
            </pre>
          </div>

          <h1 className="text-5xl font-mono font-bold text-green-400 mb-4">
            Welcome to SolChat
          </h1>

          <p className="text-xl text-green-300 font-mono mb-8 max-w-2xl mx-auto">
            The first truly decentralized, on-chain messaging application built on Solana.
            All messages are stored permanently on the blockchain.
          </p>

          <div className="flex gap-4 justify-center mb-16">
            <Link
              href="/chat"
              className="bg-green-600 hover:bg-green-700 text-black font-mono px-8 py-4 text-lg transition-colors border-2 border-green-400"
            >
              [START CHATTING]
            </Link>

            <Link
              href="/account"
              className="border-2 border-green-600 hover:border-green-400 text-green-400 font-mono px-8 py-4 text-lg transition-colors"
            >
              [VIEW ACCOUNT]
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="bg-black border-2 border-green-600 p-6">
            <h3 className="text-green-400 font-mono text-xl mb-3">🔒 Encrypted</h3>
            <p className="text-green-300 font-mono text-sm">
              Optional end-to-end encryption using Hanlock. Your messages stay private.
            </p>
          </div>

          <div className="bg-black border-2 border-green-600 p-6">
            <h3 className="text-green-400 font-mono text-xl mb-3">⛓️ On-Chain</h3>
            <p className="text-green-300 font-mono text-sm">
              Messages stored permanently on Solana blockchain via IQ Protocol.
            </p>
          </div>

          <div className="bg-black border-2 border-green-600 p-6">
            <h3 className="text-green-400 font-mono text-xl mb-3">🚀 Fast</h3>
            <p className="text-green-300 font-mono text-sm">
              Powered by Solana's high-speed blockchain. Real-time message delivery.
            </p>
          </div>
        </div>

        <div className="mt-16 max-w-3xl mx-auto bg-black border-2 border-green-600 p-6">
          <h2 className="text-green-400 font-mono text-2xl mb-4">How It Works</h2>
          <div className="space-y-3 text-green-300 font-mono text-sm">
            <p>1. Connect your Solana wallet (Phantom, Solflare, etc.)</p>
            <p>2. Create a chat room or join an existing one</p>
            <p>3. Set your nickname and optional encryption key</p>
            <p>4. Start messaging - all messages are stored on-chain!</p>
            <p>5. Use /help command to see all available features</p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <p className="text-green-400 font-mono text-sm">
            Built with ❤️ on Solana | Powered by IQ Protocol
          </p>
        </div>
      </main>
    </div>
  );
}
