'use client';

import { useState, useEffect, useRef } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Terminal } from '@/components/ui/terminal';
import { TerminalInput } from '@/components/ui/terminal-input';
import { useAppWallet, useAppConnection } from '@/lib/wallet/use-app-wallet';
import {
    pdaExists,
    getServerPDA,
    initializeServer,
    sendChat,
    getChatRecords,
    joinChat,
    leaveChat,
    WalletExecutor,
    requestAirdrop,
} from '@/lib/iq';
// import type { WalletExecutor } from '@/lib/iq';
import { encodeWithPassword, decodeWithPassword } from 'hanlock';
import { getBonkBalance, sendBonk } from '@/lib/token/bonk';
import { lamportsToSol } from '@/lib/iq/utils';
import { useUserInit } from '@/lib/onchainDB/hooks/use-user-init';

type ChatPhase =
  | 'idle'
  | 'waitingForServerId'
  | 'waitingForJoinResponse'
  | 'inChat'
  | 'waitingForCreateResponse'
  | 'waitingForHandle'
  | 'waitingForEncryptionResponse'
  | 'waitingForEncryptionKey'
  | 'playground';

interface ConversationState {
  phase: ChatPhase;
  serverPDA: string | null;
  serverId: string | null;
}

export function ChatInterface() {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();
  const { isInitialized, isInitializing, error: initError } = useUserInit();

  const [history, setHistory] = useState<string[]>([
    '╔══════════════════════════════════════════════════════════════╗',
    '║                        SOLCHAT v1.0                          ║',
    '║                 Decentralized Chat on Solana                 ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    'Welcome to SolChat! Type /help for commands.',
    '',
  ]);

  const [conversationState, setConversationState] = useState<ConversationState>({
    phase: 'idle',
    serverPDA: null,
    serverId: null,
  });

  const [handle, setHandle] = useState('User');
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [messageColor, setMessageColor] = useState('#7A8CFF');
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [lastTxid, setLastTxid] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const encryptionKeyRef = useRef(encryptionKey);

  useEffect(() => {
    encryptionKeyRef.current = encryptionKey;
  }, [encryptionKey]);

  // Show initialization status
  useEffect(() => {
    if (isInitializing && wallet.publicKey) {
      addToHistory('[SYSTEM] Initializing your account for first-time use...');
    } else if (initError) {
      addToHistory(`[ERROR] Failed to initialize account: ${initError.message}`);
    } else if (isInitialized && wallet.publicKey) {
      addToHistory('[SYSTEM] ✓ Account ready');
    }
  }, [isInitialized, isInitializing, initError]);

  // Show main menu when idle
  useEffect(() => {
    if (conversationState.phase === 'idle' && wallet.publicKey) {
      showMainMenu();
    }
  }, [conversationState.phase, wallet.publicKey]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscriptionId !== null) {
        leaveChat(connection, subscriptionId);
      }
    };
  }, [subscriptionId, connection]);

  const addToHistory = (message: string) => {
    setHistory((prev) => [...prev, message]);
  };

  const showMainMenu = () => {
    addToHistory('');
    addToHistory('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    addToHistory('Main Menu:');
    addToHistory('  1. Create/Search for a room');
    addToHistory('  2. Enter friend\'s room (PDA)');
    addToHistory('  3. Enter Playground');
    addToHistory('');
    addToHistory('Type /help for all commands');
    addToHistory('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    addToHistory('');
  };

  const showHelp = () => {
    addToHistory('');
    addToHistory('Available Commands:');
    addToHistory('  /help              - Show this help message');
    addToHistory('  /clear             - Clear screen');
    addToHistory('  /color [color]     - Change message color (blue/red/violet/cyan)');
    addToHistory('  /pw [key]          - Set encryption key');
    addToHistory('  /pw off            - Disable encryption');
    addToHistory('  /balance           - Check wallet balance');
    addToHistory('  /airdrop [amount]  - Request SOL airdrop (devnet only, default: 1)');
    addToHistory('  /sendbonk [addr] [amount] - Send BONK tokens');
    addToHistory('  /leave             - Exit current chat room');
    addToHistory('');
  };

  const processCommand = async (input: string) => {
    const canTransact = !!wallet.signTransaction || !!wallet.sendTransaction;
    if (!wallet.publicKey || !canTransact) {
      addToHistory('> ' + input);
      addToHistory('[ERROR] Please connect your wallet first!');
      return;
    }

    const signingWallet: WalletExecutor = {
      publicKey: wallet.publicKey!,
      signTransaction: wallet.signTransaction ?? undefined,
      sendTransaction: wallet.sendTransaction ?? undefined,
    };

    // Don't echo input when sending chat messages - they'll appear from blockchain subscription
    if (conversationState.phase !== 'inChat') {
      addToHistory('> ' + input);
    }

    // Handle slash commands
    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const command = parts[0].toLowerCase();

      switch (command) {
        case '/help':
          showHelp();
          return;

        case '/clear':
          setHistory([]);
          showMainMenu();
          return;

        case '/color':
          if (parts[1]) {
            const colorMap: Record<string, string> = {
              blue: '#1e90ff',
              red: '#ff4444',
              violet: '#6C4DFF',
              cyan: '#00E0E0',
            };
            const newColor = colorMap[parts[1].toLowerCase()];
            if (newColor) {
              setMessageColor(newColor);
              addToHistory(`[SYSTEM] Message color changed to ${parts[1]}`);
            } else {
              addToHistory('[ERROR] Unknown color. Available: blue, red, violet, cyan');
            }
          }
          return;

        case '/pw':
          if (parts[1] === 'off') {
            setEncryptionKey(null);
            addToHistory('[SYSTEM] Encryption disabled');
          } else if (parts[1]) {
            setEncryptionKey(parts.slice(1).join(' '));
            addToHistory('[SYSTEM] Encryption key set');
          } else {
            addToHistory('[ERROR] Usage: /pw <key> or /pw off');
          }
          return;

        case '/balance':
          try {
            const balance = await connection.getBalance(wallet.publicKey);
            const bonkBalance = await getBonkBalance(connection, wallet.publicKey);
            addToHistory(`[BALANCE] SOL: ${lamportsToSol(balance).toFixed(4)}`);
            addToHistory(`[BALANCE] BONK: ${bonkBalance.toFixed(2)}`);
          } catch (error) {
            addToHistory('[ERROR] Failed to fetch balance');
          }
          return;

        case '/sendbonk':
          if (parts.length < 3) {
            addToHistory('[ERROR] Usage: /sendbonk <address> <amount>');
            return;
          }
          try {
            const txid = await sendBonk(
              connection,
              wallet as any,
              parts[1],
              parseFloat(parts[2])
            );
            addToHistory(`[SUCCESS] Sent ${parts[2]} BONK`);
            addToHistory(`[TX] ${txid}`);
          } catch (error) {
            addToHistory(`[ERROR] Failed to send BONK: ${error}`);
          }
          return;

        case '/airdrop':
          try {
            addToHistory('[SYSTEM] Requesting airdrop...');
            const amount = parts[1] ? parseFloat(parts[1]) : 1;
            const txid = await requestAirdrop(connection, wallet.publicKey!, amount);
            addToHistory(`[SUCCESS] Airdropped ${amount} SOL`);
            addToHistory(`[TX] ${txid}`);
          } catch (error) {
            addToHistory(`[ERROR] Airdrop failed: ${error}`);
            addToHistory('[TIP] Airdrops only work on devnet/testnet');
          }
          return;

        case '/leave':
          if (subscriptionId !== null) {
            await leaveChat(connection, subscriptionId);
            setSubscriptionId(null);
          }
          setConversationState({ phase: 'idle', serverPDA: null, serverId: null });
          addToHistory('[SYSTEM] Left chat room');
          return;

        default:
          addToHistory(`[ERROR] Unknown command: ${command}`);
          return;
      }
    }

    // Handle conversation state machine
    const { phase } = conversationState;

    if (phase === 'idle') {
      if (input === '1') {
        addToHistory('[SYSTEM] Enter a server alias (room name):');
        setConversationState({ ...conversationState, phase: 'waitingForServerId' });
      } else if (input === '2') {
        addToHistory('[SYSTEM] Enter server PDA:');
        setConversationState({ ...conversationState, phase: 'waitingForJoinResponse' });
      } else if (input === '3') {
        addToHistory('[SYSTEM] Entering Playground...');
        setConversationState({ ...conversationState, phase: 'playground', serverPDA: 'playground' });
        enterPlayground();
      } else {
        addToHistory('[ERROR] Invalid option. Type 1, 2, or 3');
      }
    } else if (phase === 'waitingForServerId') {
      try {
        addToHistory('[SYSTEM] Checking for room...');
        const pda = await getServerPDA(wallet.publicKey.toBase58(), input);
        const isPDAExist = await pdaExists(connection, pda);
        console.log('Room exists:', isPDAExist);

        if (isPDAExist) {
          addToHistory(`[SERVER] Found existing room: ${input}`);
          addToHistory(`[PDA] ${pda}`);
          addToHistory('[SYSTEM] Join this room? (yes/no)');
          setConversationState({ phase: 'waitingForCreateResponse', serverPDA: pda, serverId: input });
        } else {
          addToHistory(`[SERVER] Room "${input}" doesn't exist yet`);
          addToHistory(`[PDA] ${pda}`);
          addToHistory('[SYSTEM] Create this room? (yes/no)');
          setConversationState({ phase: 'waitingForCreateResponse', serverPDA: pda, serverId: input });
        }
      } catch (error) {
        addToHistory('[ERROR] Failed to check server PDA');
        addToHistory(String(error));
        setConversationState({ ...conversationState, phase: 'idle' });
      }
    } else if (phase === 'waitingForCreateResponse') {
      if (input.toLowerCase() === 'yes') {
        try {
          // Check if room needs to be created
          const roomExists = await pdaExists(connection, conversationState.serverPDA!);

          if (!roomExists) {
            addToHistory('[SYSTEM] Creating room...');
            const { pda: createdPda, txid } = await initializeServer(
              connection,
              signingWallet,
              conversationState.serverId!
            );
            addToHistory(`[SUCCESS] Room created!`);
            addToHistory(`[TX] ${txid}`);

            // Wait a bit for transaction to be confirmed
            addToHistory('[SYSTEM] Waiting for confirmation...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            addToHistory('[SYSTEM] Room already exists, joining...');
          }

          addToHistory('[SYSTEM] Enter your nickname:');
          setConversationState({ ...conversationState, phase: 'waitingForHandle' });
        } catch (error: any) {
          addToHistory(`[ERROR] Failed to initialize room: ${error.message || error}`);
          addToHistory('[SYSTEM] Returning to main menu...');
          setConversationState({ phase: 'idle', serverPDA: null, serverId: null });
        }
      } else {
        setConversationState({ phase: 'idle', serverPDA: null, serverId: null });
        addToHistory('[SYSTEM] Cancelled');
      }
    } else if (phase === 'waitingForJoinResponse') {
      try {
        const pda = new PublicKey(input);
        setConversationState({ ...conversationState, phase: 'waitingForHandle', serverPDA: input });
        addToHistory('[SYSTEM] Enter your nickname:');
      } catch (error) {
        addToHistory('[ERROR] Invalid PDA address');
        setConversationState({ ...conversationState, phase: 'idle' });
      }
    } else if (phase === 'waitingForHandle') {
      setHandle(input);
      setConversationState({ ...conversationState, phase: 'waitingForEncryptionResponse' });
      addToHistory(`[SYSTEM] Nickname set to: ${input}`);
      addToHistory('[SYSTEM] Enable encryption? (yes/no)');
    } else if (phase === 'waitingForEncryptionResponse') {
      if (input.toLowerCase() === 'yes') {
        setConversationState({ ...conversationState, phase: 'waitingForEncryptionKey' });
        addToHistory('[SYSTEM] Enter encryption key:');
      } else {
        enterChatRoom();
      }
    } else if (phase === 'waitingForEncryptionKey') {
      setEncryptionKey(input);
      addToHistory('[SYSTEM] Encryption enabled');
      enterChatRoom();
    } else if (phase === 'inChat') {
      // Send message
      try {
        setIsSending(true);
        addToHistory('[SENDING...]');

        let messageToSend = input;
        if (encryptionKey) {
          messageToSend = encodeWithPassword(input, encryptionKey);
        }

        const txid = await sendChat(
          connection,
          wallet as any,
          conversationState.serverPDA!,
          messageToSend,
          handle
        );
        setLastTxid(txid);
        // Message will appear via subscription, which will clear the sending indicator
      } catch (error: any) {
        setIsSending(false);
        // Remove the sending indicator
        setHistory((prev) => prev.filter(line => line !== '[SENDING...]'));

        const errorMessage = error?.message || String(error);

        // Show user-friendly error messages
        if (errorMessage.includes('Insufficient SOL balance')) {
          addToHistory('[ERROR] Insufficient SOL balance to send message!');
          addToHistory('[TIP] Use /balance to check your balance');
          addToHistory('[TIP] Use /airdrop to get devnet SOL (if on devnet)');
        } else if (errorMessage.includes('Please log in with Privy')) {
          addToHistory('[ERROR] Please log in with Privy to send messages');
        } else {
          addToHistory(`[ERROR] Failed to send message: ${errorMessage}`);
        }
      }
    } else if (phase === 'playground') {
      addToHistory(`[ECHO] ${input}`);
      addToHistory('[PLAYGROUND] This is a test environment. Messages are not sent to the chain.');
    }
  };

  const enterChatRoom = async () => {
    setConversationState({ ...conversationState, phase: 'inChat' });
    addToHistory('');
    addToHistory('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    addToHistory(`[ROOM] Connected to: ${conversationState.serverId || conversationState.serverPDA}`);
    addToHistory('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    addToHistory('');

    // Load chat history
    try {
      addToHistory('[SYSTEM] Loading recent messages...');
      const messages = await getChatRecords(connection, conversationState.serverPDA!, 5);
      messages.forEach((msg) => {
        const displayMsg = decryptMessageIfNeeded(msg.message);
        addToHistory(displayMsg);
      });
      addToHistory('[SYSTEM] Chat history loaded');
    } catch (error) {
      addToHistory('[SYSTEM] No previous messages');
    }

    // Subscribe to new messages
    try {
      const subId = joinChat(connection, conversationState.serverPDA!, (message) => {
        const displayMsg = decryptMessageIfNeeded(message);
        setHistory((prev) => {
          // Remove [SENDING...] indicator and add the new message
          const filtered = prev.filter(line => line !== '[SENDING...]');
          return [...filtered, displayMsg];
        });
        setIsSending(false);
      });
      setSubscriptionId(subId);
      addToHistory('[SYSTEM] Listening for new messages...');
    } catch (error) {
      addToHistory('[ERROR] Failed to subscribe to chat');
    }

    addToHistory('');
    addToHistory('Type your message or /help for commands');
    addToHistory('');
  };

  const enterPlayground = () => {
    addToHistory('');
    addToHistory('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    addToHistory('[PLAYGROUND] Test Environment');
    addToHistory('[PLAYGROUND] Messages here are not sent to the blockchain');
    addToHistory('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    addToHistory('');
  };

  const decryptMessageIfNeeded = (message: string): string => {
    if (!encryptionKeyRef.current || !message.includes(': ')) {
      return message;
    }

    try {
      const parts = message.split(': ');
      if (parts.length < 2) return message;

      const handle = parts[0];
      const encrypted = parts.slice(1).join(': ');

      const decrypted = decodeWithPassword(encrypted, encryptionKeyRef.current);
      return `${handle}: ${decrypted}`;
    } catch {
      return message; // Return as-is if decryption fails
    }
  };

  if (!wallet.connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-[#7A8CFF]   text-xl mb-4">
            Please connect your wallet to use SolChat
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Terminal lines={history} className="flex-1 mb-4 h-[calc(100vh-200px)]" />
      <TerminalInput
        onSubmit={processCommand}
        disabled={false}
        prompt={conversationState.phase === 'inChat' ? `[${handle}] >` : '>'}
      />
    </div>
  );
}
