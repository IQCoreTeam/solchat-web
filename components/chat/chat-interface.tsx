'use client';

import { useState, useEffect, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Terminal } from '@/components/ui/terminal';
import { TerminalInput } from '@/components/ui/terminal-input';
import {
    pdaExists,
    getServerPDA,
    initializeServer,
    sendChat,
    getChatRecords,
    joinChat,
    leaveChat, WalletExecutor,

} from '@/lib/iq';
// import type { WalletExecutor } from '@/lib/iq';
import { encodeWithPassword, decodeWithPassword } from 'hanlock';
import { getBonkBalance, sendBonk } from '@/lib/token/bonk';
import { lamportsToSol } from '@/lib/iq/utils';

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
  const { connection } = useConnection();
  const wallet = useWallet();

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
  const [messageColor, setMessageColor] = useState('#1e90ff');
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [lastTxid, setLastTxid] = useState<string | null>(null);

  const encryptionKeyRef = useRef(encryptionKey);

  useEffect(() => {
    encryptionKeyRef.current = encryptionKey;
  }, [encryptionKey]);

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
    addToHistory('  /color [color]     - Change message color (blue/red/green)');
    addToHistory('  /pw [key]          - Set encryption key');
    addToHistory('  /pw off            - Disable encryption');
    addToHistory('  /balance           - Check wallet balance');
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

    addToHistory('> ' + input);

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
              green: '#00ff00',
              yellow: '#ffff00',
            };
            const newColor = colorMap[parts[1].toLowerCase()];
            if (newColor) {
              setMessageColor(newColor);
              addToHistory(`[SYSTEM] Message color changed to ${parts[1]}`);
            } else {
              addToHistory('[ERROR] Unknown color. Available: blue, red, green, yellow');
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
        let pda = await getServerPDA(wallet.publicKey.toBase58(), input);
          const isPDAExist = await pdaExists(connection,pda);
        console.log(isPDAExist);
        if (!isPDAExist) {

            addToHistory('Creating room...');
          const { pda: createdPda, txid:txid} = await initializeServer(connection, signingWallet, input);
            addToHistory(createdPda);
            addToHistory(txid);
          pda = createdPda;
        }
        setConversationState({ phase: 'waitingForCreateResponse', serverPDA: pda, serverId: input });
        addToHistory(`[SERVER] Found/Created room: ${input}`);
        addToHistory(`[PDA] ${pda}`);
        addToHistory('[SYSTEM] Join this room? (yes/no)');
      } catch (error) {
        addToHistory('[ERROR] Failed to get server PDA');
        setConversationState({ ...conversationState, phase: 'idle' });
      }
    } else if (phase === 'waitingForCreateResponse') {
      if (input.toLowerCase() === 'yes') {
        try {
          addToHistory('[SYSTEM] Initializing room...');
          await initializeServer(connection, signingWallet, conversationState.serverId!);
          addToHistory('[SUCCESS] Room initialized!');
          addToHistory('[SYSTEM] Enter your nickname:');
          setConversationState({ ...conversationState, phase: 'waitingForHandle' });
        } catch (error) {
          addToHistory('[SYSTEM] Room may already exist, continuing...');
          addToHistory('[SYSTEM] Enter your nickname:');
          setConversationState({ ...conversationState, phase: 'waitingForHandle' });
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
        // Message will appear via subscription
      } catch (error) {
        addToHistory(`[ERROR] Failed to send message: ${error}`);
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
        setHistory((prev) => [...prev, displayMsg]);
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
          <p className="text-green-400 font-mono text-xl mb-4">
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
