'use client';

/**
 * useVoiceCall Hook
 *
 * Main hook for voice calling with full on-chain signaling.
 * Subscribes to TxRef account for incoming signals, manages call state,
 * and handles WebRTC peer connection.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import type { WriterCtx } from '@/lib/onchainDB';
import { pdaTxRef } from '@/lib/onchainDB';
import { ROOT_ID } from '@/lib/onchainDB/constants';
import {
  type CallSignal,
  type CallState,
  type CallStatus,
  parseCallSignal,
  CALL_OFFER_TIMEOUT_MS,
} from './types';
import {
  ensureCallsTable,
  sendCallOffer,
  sendCallAccept,
  sendCallReject,
  sendCallEnd,
  sendSdpOffer,
  sendSdpAnswer,
  sendIceCandidates,
  pollRecentCallSignals,
  sendCallProof,
} from './call-signaling';
import { reassembleSdp } from './sdp-chunker';
import { buildMerkleTree, getMerkleRoot } from './proof';
import { WebRTCManager, type WebRTCState } from './webrtc-manager';
import {
  generateEncryptionKeypair,
  encryptForRecipient,
  decryptFromSender,
  uint8ArrayToHex,
  hexToUint8Array,
} from './encryption';
import type { BoxKeyPair } from 'tweetnacl';

interface UseVoiceCallOptions {
  connection: Connection | null;
  writerCtx: WriterCtx | null;
  userPubkey: string | null;
  onError?: (error: string) => void;
  debug?: boolean;
}

interface UseVoiceCallReturn {
  // State
  status: CallStatus;
  callId: string | null;
  remotePubkey: string | null;
  isOutgoing: boolean;
  isMuted: boolean;
  webrtcState: WebRTCState;
  isRecording: boolean;
  isScreenSharing: boolean;
  isVideoEnabled: boolean; // Local video state
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;

  // Actions
  startCall: (targetPubkey: string, video?: boolean) => Promise<boolean>;
  acceptCall: (video?: boolean) => Promise<boolean>;
  rejectCall: (reason?: string) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleRecording: () => void;
  toggleScreenShare: () => Promise<void>;

  // Status
  isReady: boolean;
}

const INITIAL_STATE: CallState = {
  status: 'idle',
  callId: null,
  remotePubkey: null,
  isOutgoing: false,
  error: null,
  remoteSdpChunks: new Map(),
  remoteSdpTotal: null,
  pendingIceCandidates: [],
  startedAt: null,
};

export function useVoiceCall({
  connection,
  writerCtx,
  userPubkey,
  onError,
  debug = true,
}: UseVoiceCallOptions): UseVoiceCallReturn {
  const [state, setState] = useState<CallState>(INITIAL_STATE);
  const [webrtcState, setWebrtcState] = useState<WebRTCState>('new');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [tableReady, setTableReady] = useState(false);

  const webrtcRef = useRef<WebRTCManager | null>(null);
  const subscriptionRef = useRef<number | null>(null);
  const offerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const sdpProcessedRef = useRef<boolean>(false); // Track if we've already processed remote SDP
  const handleSignalRef = useRef<((signal: CallSignal) => Promise<void>) | null>(null); // Stable ref for subscription
  const remoteSdpChunksRef = useRef<Map<number, string>>(new Map()); // Use ref to avoid stale closure issues
  const sdpPollIntervalRef = useRef<NodeJS.Timeout | null>(null); // Polling interval for missed SDP chunks
  const expectedSdpTotalRef = useRef<number | null>(null); // Expected total SDP chunks

  // Encryption: generate keypair once per session, store remote party's public key
  const encryptionKeypairRef = useRef<BoxKeyPair | null>(null);
  const remoteEncPubKeyRef = useRef<Uint8Array | null>(null);

  const log = useCallback((...args: unknown[]) => {
    if (debug) {
      console.log('[useVoiceCall]', ...args);
    }
  }, [debug]);

  // Lazily initialize encryption keypair
  const getEncryptionKeypair = useCallback((): BoxKeyPair => {
    if (!encryptionKeypairRef.current) {
      encryptionKeypairRef.current = generateEncryptionKeypair();
      log('Generated encryption keypair');
    }
    return encryptionKeypairRef.current;
  }, [log]);

  // Cleanup function
  const cleanup = useCallback(() => {
    log('Cleanup');

    if (offerTimeoutRef.current) {
      clearTimeout(offerTimeoutRef.current);
      offerTimeoutRef.current = null;
    }

    if (sdpPollIntervalRef.current) {
      clearInterval(sdpPollIntervalRef.current);
      sdpPollIntervalRef.current = null;
    }

    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }

    processedSignalsRef.current.clear();
    sdpProcessedRef.current = false;
    remoteSdpChunksRef.current.clear();
    expectedSdpTotalRef.current = null;
    remoteEncPubKeyRef.current = null; // Clear remote encryption key on cleanup
    setState(INITIAL_STATE);
    setWebrtcState('new');
    setIsMuted(false);
    setIsVideoEnabled(false);
    setIsRecording(false);
    setLocalStream(null);
    setRemoteStream(null);
  }, [log]);

  // Initialize WebRTC manager
  const initWebRTC = useCallback(async (
    callId: string,
    remotePubkey: string,
    video: boolean = false
  ): Promise<WebRTCManager> => {
    if (!connection || !writerCtx || !userPubkey) {
      throw new Error('Missing connection or wallet');
    }

    const manager = new WebRTCManager({
      onIceCandidates: async (candidates) => {
        // Prepare encryption if we have remote public key
        const encryptionParams = remoteEncPubKeyRef.current && encryptionKeypairRef.current
          ? {
              recipientPubKey: remoteEncPubKeyRef.current,
              senderSecretKey: encryptionKeypairRef.current.secretKey,
            }
          : undefined;

        log('Sending', candidates.length, 'ICE candidates (batched)', encryptionParams ? '(encrypted)' : '(plaintext)');
        await sendIceCandidates(
          connection,
          writerCtx,
          callId,
          userPubkey,
          remotePubkey,
          candidates,
          encryptionParams
        );
      },
      onConnectionStateChange: (newState) => {
        log('WebRTC state:', newState);
        setWebrtcState(newState);

        if (newState === 'connected') {
          setState(prev => ({ ...prev, status: 'active', startedAt: Date.now() }));
          // Note: Recording is now OPT-IN via toggleRecording
        } else if (newState === 'failed' || newState === 'disconnected') {
          setState(prev => ({ ...prev, error: 'Connection lost' }));
        }
      },
      onRemoteStream: (stream) => {
        log('Remote stream received, tracks:', stream.getTracks().length);
        setRemoteStream(stream);
      },
      onError: (error) => {
        log('WebRTC error:', error);
        onError?.(error);
        setState(prev => ({ ...prev, error }));
      },
      debug,
    });

    await manager.initialize(video);
    webrtcRef.current = manager;
    setLocalStream(manager.getLocalStream());
    setIsVideoEnabled(video);

    return manager;
  }, [connection, writerCtx, userPubkey, log, debug, onError]);

  // Handle incoming call signal
  const handleSignal = useCallback(async (signal: CallSignal) => {
    // Log ALL incoming signals before any filtering
    log('RAW signal:', signal.type, 'chunk:', signal.sdpChunk, '/', signal.sdpTotal, 'from:', signal.from?.slice(0, 8), 'to:', signal.to?.slice(0, 8));

    // Skip if not for us
    if (signal.to !== userPubkey && signal.from !== userPubkey) {
      log('  -> Skipped: not for us');
      return;
    }

    // Skip our own signals
    if (signal.from === userPubkey) {
      log('  -> Skipped: our own signal');
      return;
    }

    // Dedupe signals
    const signalKey = `${signal.type}-${signal.callId}-${signal.timestamp}`;
    if (processedSignalsRef.current.has(signalKey)) {
      log('  -> Skipped: duplicate signal');
      return;
    }
    processedSignalsRef.current.add(signalKey);

    log('Processing signal:', signal.type, 'from:', signal.from.slice(0, 8), 'callId:', signal.callId?.slice(0, 12), 'chunk:', signal.sdpChunk, '/', signal.sdpTotal);

    switch (signal.type) {
      case 'call-offer': {
        // Incoming call
        if (state.status !== 'idle') {
          // Busy - auto reject
          if (connection && writerCtx && userPubkey) {
            await sendCallReject(
              connection,
              writerCtx,
              signal.callId,
              userPubkey,
              signal.from,
              'busy'
            );
          }
          return;
        }

        // Store remote encryption public key if provided
        if (signal.encPubKey) {
          remoteEncPubKeyRef.current = hexToUint8Array(signal.encPubKey);
          log('Stored remote encryption key from call-offer, length:', remoteEncPubKeyRef.current.length);
        } else {
          log('WARNING: call-offer missing encryption public key!');
        }

        setState({
          ...INITIAL_STATE,
          status: 'incoming',
          callId: signal.callId,
          remotePubkey: signal.from,
          isOutgoing: false,
        });
        break;
      }

      case 'call-accept': {
        // Our offer was accepted
        if (state.status !== 'offering' || state.callId !== signal.callId) {
          return;
        }

        log('Call accepted, initializing WebRTC...');

        // Store remote encryption public key if provided
        if (signal.encPubKey) {
          remoteEncPubKeyRef.current = hexToUint8Array(signal.encPubKey);
          log('Stored remote encryption key from call-accept, length:', remoteEncPubKeyRef.current.length);
        } else {
          log('WARNING: call-accept missing encryption public key!');
        }

        if (offerTimeoutRef.current) {
          clearTimeout(offerTimeoutRef.current);
          offerTimeoutRef.current = null;
        }

        setState(prev => ({ ...prev, status: 'connecting' }));

        try {
          const manager = await initWebRTC(signal.callId, signal.from, isVideoEnabled);
          const sdp = await manager.createOffer();

          // Prepare encryption if we have remote public key
          const encryptionParams = remoteEncPubKeyRef.current && encryptionKeypairRef.current
            ? {
                recipientPubKey: remoteEncPubKeyRef.current,
                senderSecretKey: encryptionKeypairRef.current.secretKey,
              }
            : undefined;

          log('Sending SDP offer...', encryptionParams ? '(encrypted)' : '(plaintext)');
          await sendSdpOffer(
            connection!,
            writerCtx!,
            signal.callId,
            userPubkey!,
            signal.from,
            sdp,
            encryptionParams
          );

          // Flush ICE candidates AFTER SDP is sent to ensure proper ordering
          log('SDP offer sent, now flushing ICE candidates...');
          manager.flushIceCandidatesNow();
        } catch (error) {
          log('Failed to create offer:', error);
          setState(prev => ({
            ...prev,
            status: 'error',
            error: 'Failed to initialize call',
          }));
        }
        break;
      }

      case 'call-reject': {
        if (state.callId !== signal.callId) return;
        log('Call rejected:', signal.reason);
        cleanup();
        onError?.(`Call rejected: ${signal.reason || 'No reason'}`);
        break;
      }

      case 'call-end': {
        if (state.callId !== signal.callId) return;
        log('Call ended by remote');
        cleanup();
        break;
      }

      case 'sdp-offer': {
        log('SDP-OFFER check: state.callId=', state.callId?.slice(0, 12), 'signal.callId=', signal.callId?.slice(0, 12), 'state.status=', state.status);
        if (state.callId !== signal.callId) {
          log('  -> Skipped: callId mismatch');
          return;
        }

        // Skip if we've already processed the SDP offer
        if (sdpProcessedRef.current) {
          log('SDP offer already processed, skipping');
          return;
        }

        // Collect SDP chunks using ref (avoids stale closure issues)
        if (signal.sdp && signal.sdpChunk !== undefined) {
          let chunkData = signal.sdp;

          // Track expected total for polling mechanism
          if (signal.sdpTotal) {
            expectedSdpTotalRef.current = signal.sdpTotal;
          }

          // Decrypt chunk if encrypted
          if (signal.encrypted) {
            log(`SDP offer chunk ${signal.sdpChunk + 1}/${signal.sdpTotal} is encrypted, attempting decrypt...`);
            log(`  - Have remote pubkey: ${!!remoteEncPubKeyRef.current}`);
            log(`  - Have own keypair: ${!!encryptionKeypairRef.current}`);
            log(`  - Have nonce: ${!!signal.nonce}`);

            if (signal.nonce && remoteEncPubKeyRef.current && encryptionKeypairRef.current) {
              const decrypted = decryptFromSender(
                signal.sdp,
                signal.nonce,
                remoteEncPubKeyRef.current,
                encryptionKeypairRef.current.secretKey
              );
              if (decrypted) {
                chunkData = decrypted;
                log(`SDP offer chunk ${signal.sdpChunk + 1}/${signal.sdpTotal} decrypted successfully`);
              } else {
                log(`Failed to decrypt SDP offer chunk ${signal.sdpChunk + 1}/${signal.sdpTotal} - decryption returned null`);
                return;
              }
            } else {
              log(`ERROR: Cannot decrypt SDP offer chunk - missing keys!`);
              return;
            }
          }

          remoteSdpChunksRef.current.set(signal.sdpChunk, chunkData);
          log(`SDP offer chunk ${signal.sdpChunk + 1}/${signal.sdpTotal} stored (have ${remoteSdpChunksRef.current.size}/${signal.sdpTotal})`);

        }

        // Check if we have all chunks
        const totalChunks = signal.sdpTotal;
        if (!totalChunks) return;

        if (remoteSdpChunksRef.current.size >= totalChunks) {
          const fullSdp = reassembleSdp(remoteSdpChunksRef.current, totalChunks);
          if (fullSdp) {
            log('SDP offer reassembled, length:', fullSdp.length);
            sdpProcessedRef.current = true; // Mark as processed BEFORE handling

            try {
              if (!webrtcRef.current) {
                await initWebRTC(signal.callId, signal.from, isVideoEnabled);
              }

              const answerSdp = await webrtcRef.current!.handleOffer(fullSdp);

              // Prepare encryption if we have remote public key
              const encryptionParams = remoteEncPubKeyRef.current && encryptionKeypairRef.current
                ? {
                    recipientPubKey: remoteEncPubKeyRef.current,
                    senderSecretKey: encryptionKeypairRef.current.secretKey,
                  }
                : undefined;

              log('Sending SDP answer...', encryptionParams ? '(encrypted)' : '(plaintext)');
              await sendSdpAnswer(
                connection!,
                writerCtx!,
                signal.callId,
                userPubkey!,
                signal.from,
                answerSdp,
                encryptionParams
              );

              // Flush ICE candidates AFTER SDP is sent to ensure proper ordering
              log('SDP answer sent, now flushing ICE candidates...');
              webrtcRef.current?.flushIceCandidatesNow();
            } catch (error) {
              log('Failed to handle SDP offer:', error);
              sdpProcessedRef.current = false; // Reset on error
              setState(prev => ({
                ...prev,
                status: 'error',
                error: 'Failed to process call',
              }));
            }
          }
        }
        break;
      }

      case 'sdp-answer': {
        if (state.callId !== signal.callId) return;

        // Skip if we've already processed the SDP answer
        if (sdpProcessedRef.current) {
          log('SDP answer already processed, skipping');
          return;
        }

        // Collect SDP chunks using ref (avoids stale closure issues)
        if (signal.sdp && signal.sdpChunk !== undefined) {
          let chunkData = signal.sdp;

          // Track expected total for polling mechanism
          if (signal.sdpTotal) {
            expectedSdpTotalRef.current = signal.sdpTotal;
          }

          // Decrypt chunk if encrypted
          if (signal.encrypted) {
            log(`SDP answer chunk ${signal.sdpChunk + 1}/${signal.sdpTotal} is encrypted, attempting decrypt...`);
            log(`  - Have remote pubkey: ${!!remoteEncPubKeyRef.current}`);
            log(`  - Have own keypair: ${!!encryptionKeypairRef.current}`);
            log(`  - Have nonce: ${!!signal.nonce}`);

            if (signal.nonce && remoteEncPubKeyRef.current && encryptionKeypairRef.current) {
              const decrypted = decryptFromSender(
                signal.sdp,
                signal.nonce,
                remoteEncPubKeyRef.current,
                encryptionKeypairRef.current.secretKey
              );
              if (decrypted) {
                chunkData = decrypted;
                log(`SDP answer chunk ${signal.sdpChunk + 1}/${signal.sdpTotal} decrypted successfully`);
              } else {
                log(`Failed to decrypt SDP answer chunk ${signal.sdpChunk + 1}/${signal.sdpTotal} - decryption returned null`);
                return;
              }
            } else {
              log(`ERROR: Cannot decrypt SDP answer chunk - missing keys!`);
              return;
            }
          }

          remoteSdpChunksRef.current.set(signal.sdpChunk, chunkData);
          log(`SDP answer chunk ${signal.sdpChunk + 1}/${signal.sdpTotal} stored (have ${remoteSdpChunksRef.current.size}/${signal.sdpTotal})`);
        }

        // Check if we have all chunks
        const totalChunks = signal.sdpTotal;
        if (!totalChunks) return;

        if (remoteSdpChunksRef.current.size >= totalChunks && webrtcRef.current) {
          const fullSdp = reassembleSdp(remoteSdpChunksRef.current, totalChunks);
          if (fullSdp) {
            log('SDP answer reassembled, length:', fullSdp.length);
            sdpProcessedRef.current = true; // Mark as processed BEFORE handling
            try {
              await webrtcRef.current.handleAnswer(fullSdp);
            } catch (error) {
              log('Failed to handle SDP answer:', error);
              sdpProcessedRef.current = false; // Reset on error to allow retry
            }
          }
        }
        break;
      }

      case 'ice-candidate': {
        if (state.callId !== signal.callId) return;

        if (signal.candidate) {
          try {
            let candidateJson = signal.candidate;

            // Decrypt if encrypted
            if (signal.encrypted) {
              log('ICE candidates are encrypted, attempting decrypt...');
              log(`  - Have remote pubkey: ${!!remoteEncPubKeyRef.current}`);
              log(`  - Have own keypair: ${!!encryptionKeypairRef.current}`);
              log(`  - Have nonce: ${!!signal.nonce}`);

              if (signal.nonce && remoteEncPubKeyRef.current && encryptionKeypairRef.current) {
                const decrypted = decryptFromSender(
                  signal.candidate,
                  signal.nonce,
                  remoteEncPubKeyRef.current,
                  encryptionKeypairRef.current.secretKey
                );
                if (decrypted) {
                  candidateJson = decrypted;
                  log('ICE candidates decrypted successfully');
                } else {
                  log('Failed to decrypt ICE candidates - decryption returned null');
                  return;
                }
              } else {
                log('ERROR: Cannot decrypt ICE candidates - missing keys!');
                return;
              }
            }

            // Parse batched candidates (now an array)
            const parsed = JSON.parse(candidateJson);
            const candidates: RTCIceCandidateInit[] = Array.isArray(parsed) ? parsed : [parsed];

            log('Received', candidates.length, 'ICE candidates (batched)');

            for (const candidate of candidates) {
              if (webrtcRef.current) {
                await webrtcRef.current.addIceCandidate(candidate);
              } else {
                setState(prev => ({
                  ...prev,
                  pendingIceCandidates: [...prev.pendingIceCandidates, candidate],
                }));
              }
            }
          } catch (error) {
            log('Failed to parse ICE candidates:', error);
          }
        }
        break;
      }
    }
  }, [state, userPubkey, connection, writerCtx, log, cleanup, initWebRTC, onError]);

  // Keep the ref updated with latest handleSignal
  handleSignalRef.current = handleSignal;

  // Parse TxRef data to extract call signal
  const parseTxRefData = useCallback((data: Buffer): CallSignal | null => {
    if (data.length < 12) return null;

    try {
      // Skip 8-byte discriminator, read 4-byte length
      const dataLen = data.readUInt32LE(8);
      if (data.length < 12 + dataLen) return null;

      const rawData = data.slice(12, 12 + dataLen);
      const jsonStr = new TextDecoder().decode(rawData);

      return parseCallSignal(jsonStr);
    } catch {
      return null;
    }
  }, []);

  // Subscribe to TxRef for call signals
  // Uses handleSignalRef to avoid recreating subscription on every state change
  useEffect(() => {
    if (!connection || !userPubkey) return;

    const txRefPda = pdaTxRef(ROOT_ID);
    log('Subscribing to TxRef:', txRefPda.toBase58());

    const subscriptionId = connection.onAccountChange(
      txRefPda,
      (accountInfo) => {
        const signal = parseTxRefData(accountInfo.data as Buffer);
        if (signal && handleSignalRef.current) {
          handleSignalRef.current(signal);
        }
      },
      { commitment: 'processed' }
    );

    subscriptionRef.current = subscriptionId;
    log('Subscription ID:', subscriptionId);

    return () => {
      if (subscriptionRef.current !== null) {
        connection.removeAccountChangeListener(subscriptionRef.current).catch(() => {});
        subscriptionRef.current = null;
      }
    };
  }, [connection, userPubkey, log, parseTxRefData]); // Removed handleSignal - using ref instead

  // Ensure calls table exists
  useEffect(() => {
    if (!connection || !writerCtx) return;

    ensureCallsTable(connection, writerCtx).then((ready) => {
      setTableReady(ready);
      log('Calls table ready:', ready);
    });
  }, [connection, writerCtx, log]);

  // Process pending ICE candidates when WebRTC is ready
  useEffect(() => {
    if (webrtcRef.current && state.pendingIceCandidates.length > 0) {
      log('Processing', state.pendingIceCandidates.length, 'pending ICE candidates');
      state.pendingIceCandidates.forEach((candidate) => {
        webrtcRef.current?.addIceCandidate(candidate);
      });
      setState(prev => ({ ...prev, pendingIceCandidates: [] }));
    }
  }, [state.pendingIceCandidates, log, localStream]); // Added localStream as trigger for when WebRTC is ready

  // Poll for missed SDP chunks when in connecting state
  // This is the fallback mechanism to ensure we NEVER miss chunks due to TxRef overwrites
  useEffect(() => {
    // Only poll when we're in connecting state and have a callId
    if (state.status !== 'connecting' || !state.callId || !connection || !userPubkey) {
      // Clear any existing polling when not in connecting state
      if (sdpPollIntervalRef.current) {
        clearInterval(sdpPollIntervalRef.current);
        sdpPollIntervalRef.current = null;
        log('Polling stopped: not in connecting state');
      }
      return;
    }

    // Don't poll if SDP is already processed
    if (sdpProcessedRef.current) {
      if (sdpPollIntervalRef.current) {
        clearInterval(sdpPollIntervalRef.current);
        sdpPollIntervalRef.current = null;
        log('Polling stopped: SDP already processed');
      }
      return;
    }

    // Don't start a new interval if one already exists
    if (sdpPollIntervalRef.current) {
      return;
    }

    log('Starting SDP chunk polling (every 3s)...');

    // Start polling every 3 seconds (increased from 2s to reduce RPC load)
    const pollInterval = setInterval(async () => {
      // Check again if we still need to poll
      if (sdpProcessedRef.current) {
        clearInterval(pollInterval);
        sdpPollIntervalRef.current = null;
        log('Polling stopped: SDP processed');
        return;
      }

      if (!state.callId) {
        clearInterval(pollInterval);
        sdpPollIntervalRef.current = null;
        log('Polling stopped: no callId');
        return;
      }

      const chunksHave = remoteSdpChunksRef.current.size;
      const chunksExpected = expectedSdpTotalRef.current;
      log(`Polling for SDP chunks (have ${chunksHave}/${chunksExpected || '?'})...`);

      try {
        const signals = await pollRecentCallSignals(
          connection,
          state.callId,
          userPubkey,
          15 // Reduced to minimize RPC calls
        );

        if (signals.length > 0) {
          log(`Poll found ${signals.length} signals, processing...`);

          // Process each signal through the handler
          for (const signal of signals) {
            if (handleSignalRef.current) {
              await handleSignalRef.current(signal);
            }
          }
        }
      } catch (error) {
        log('Poll error:', error);
      }

      // Stop polling if SDP is now processed
      if (sdpProcessedRef.current) {
        clearInterval(pollInterval);
        sdpPollIntervalRef.current = null;
        log('SDP processed, stopping poll');
      }
    }, 3000); // Poll every 3 seconds to avoid rate limiting

    sdpPollIntervalRef.current = pollInterval;

    return () => {
      if (sdpPollIntervalRef.current) {
        clearInterval(sdpPollIntervalRef.current);
        sdpPollIntervalRef.current = null;
      }
    };
  }, [state.status, state.callId, connection, userPubkey, log]);

  // Start a call
  const startCall = useCallback(async (targetPubkey: string, video: boolean = false): Promise<boolean> => {
    if (!connection || !writerCtx || !userPubkey) {
      onError?.('Wallet not connected');
      return false;
    }

    if (state.status !== 'idle') {
      onError?.('Already in a call');
      return false;
    }

    log('Starting call to:', targetPubkey.slice(0, 8));

    // Get or generate encryption keypair for this call
    const keypair = getEncryptionKeypair();
    const encPubKeyHex = uint8ArrayToHex(keypair.publicKey);

    const { callId, signature } = await sendCallOffer(
      connection,
      writerCtx,
      userPubkey,
      targetPubkey,
      encPubKeyHex // Include our encryption public key
    );

    if (!signature) {
      onError?.('Failed to send call offer');
      return false;
    }

    setState({
      ...INITIAL_STATE,
      status: 'offering',
      callId,
      remotePubkey: targetPubkey,
      isOutgoing: true,
    });
    
    setIsVideoEnabled(video);

    // Set timeout for offer
    offerTimeoutRef.current = setTimeout(() => {
      if (state.status === 'offering') {
        log('Call offer timed out');
        cleanup();
        onError?.('No answer');
      }
    }, CALL_OFFER_TIMEOUT_MS);

    return true;
  }, [connection, writerCtx, userPubkey, state.status, log, cleanup, onError, getEncryptionKeypair]);

  // Accept incoming call
  const acceptCall = useCallback(async (video: boolean = false): Promise<boolean> => {
    if (!connection || !writerCtx || !userPubkey) {
      return false;
    }

    if (state.status !== 'incoming' || !state.callId || !state.remotePubkey) {
      return false;
    }

    log('Accepting call:', state.callId);

    setState(prev => ({ ...prev, status: 'accepting' }));

    // Get or generate encryption keypair for this call
    const keypair = getEncryptionKeypair();
    const encPubKeyHex = uint8ArrayToHex(keypair.publicKey);

    const signature = await sendCallAccept(
      connection,
      writerCtx,
      state.callId,
      userPubkey,
      state.remotePubkey,
      encPubKeyHex // Include our encryption public key
    );

    if (!signature) {
      setState(prev => ({ ...prev, status: 'error', error: 'Failed to accept' }));
      return false;
    }

    // Initialize WebRTC and wait for SDP offer
    try {
      await initWebRTC(state.callId, state.remotePubkey, video);
      setState(prev => ({ ...prev, status: 'connecting' }));
      return true;
    } catch (error) {
      log('Failed to initialize WebRTC:', error);
      setState(prev => ({ ...prev, status: 'error', error: 'Failed to initialize' }));
      return false;
    }
  }, [connection, writerCtx, userPubkey, state, log, initWebRTC, getEncryptionKeypair]);

  // Reject incoming call
  const rejectCall = useCallback(async (reason?: string): Promise<void> => {
    if (!connection || !writerCtx || !userPubkey) return;
    if (!state.callId || !state.remotePubkey) return;

    log('Rejecting call:', state.callId);

    await sendCallReject(
      connection,
      writerCtx,
      state.callId,
      userPubkey,
      state.remotePubkey,
      reason
    );

    cleanup();
  }, [connection, writerCtx, userPubkey, state, log, cleanup]);

  // End call
  const endCall = useCallback(async (): Promise<void> => {
    if (!connection || !writerCtx || !userPubkey) {
      cleanup();
      return;
    }

    if (state.callId && state.remotePubkey) {
      // Set status to ending so UI shows "ENDING..." / "Proofing..."
      setState(prev => ({ ...prev, status: 'ending' }));

      // 1. Generate and anchor proof 
      if (webrtcRef.current) {
        try {
          const recordingResult = webrtcRef.current.stopRecording();
          const encryptedChunks = recordingResult.encrypted;
          const rawChunks = recordingResult.raw;
          const mimeType = recordingResult.mimeType;

          if (encryptedChunks.length > 0) {
            log('Generating Merkle proof for', encryptedChunks.length, 'audio chunks...');
            const tree = buildMerkleTree(encryptedChunks);
            const root = getMerkleRoot(tree);
            log('Anchoring Merkle root on-chain:', root);
            
            // We await this so the proof is on-chain before the call-end signal
            await sendCallProof(
              connection,
              writerCtx,
              state.callId,
              userPubkey,
              state.remotePubkey,
              root
            );
            log('Proof anchored successfully!');

            // 2. Download proof package (keys + encrypted chunks + root + signature)
            // Ideally we also include the transaction signature, but we can't easily wait for confirmation here
            // without blocking UI too long. The root is enough for verification.
            try {
              if (remoteEncPubKeyRef.current && encryptionKeypairRef.current) {
                // A. Download JSON Evidence
                const pkg = {
                  callId: state.callId,
                  timestamp: Date.now(),
                  merkleRoot: root,
                  senderPubkey: userPubkey, 
                  remotePubkey: state.remotePubkey,
                  
                  // Keys needed to decrypt
                  mySecretKey: uint8ArrayToHex(encryptionKeypairRef.current.secretKey),
                  myPublicKey: uint8ArrayToHex(encryptionKeypairRef.current.publicKey),
                  remotePublicKey: uint8ArrayToHex(remoteEncPubKeyRef.current),

                  // The evidence
                  encryptedChunks: encryptedChunks.map(c => uint8ArrayToHex(c))
                };

                const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `call-proof-${state.callId}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                log('Proof package downloaded');

                // B. Download Playable Audio (Raw)
                if (rawChunks.length > 0) {
                   const audioBlob = new Blob(rawChunks, { type: mimeType });
                   const audioUrl = URL.createObjectURL(audioBlob);
                   
                   // Determine extension from MIME type (simple heuristic)
                   let ext = 'webm';
                   if (mimeType.includes('mp4')) ext = 'mp4';
                   else if (mimeType.includes('wav')) ext = 'wav';
                   else if (mimeType.includes('ogg')) ext = 'ogg';

                   const b = document.createElement('a');
                   b.href = audioUrl;
                   b.download = `recording-${state.callId}.${ext}`;
                   document.body.appendChild(b);
                   b.click();
                   document.body.removeChild(b);
                   URL.revokeObjectURL(audioUrl);
                   log('Audio recording downloaded:', mimeType);
                }
              }
            } catch (err) {
              console.error('Failed to download proof package:', err);
            }

          } else {
             log('No audio chunks recorded, skipping proof.');
          }
        } catch (error) {
          console.error('Failed to anchor call proof:', error);
        }
      }

      log('Ending call:', state.callId);

      await sendCallEnd(
        connection,
        writerCtx,
        state.callId,
        userPubkey,
        state.remotePubkey
      );
    }

    cleanup();
  }, [connection, writerCtx, userPubkey, state, log, cleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (webrtcRef.current) {
      const newMuted = !isMuted;
      webrtcRef.current.setMuted(newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (webrtcRef.current) {
      const newVideo = !isVideoEnabled;
      webrtcRef.current.setVideoEnabled(newVideo);
      setIsVideoEnabled(newVideo);
    }
  }, [isVideoEnabled]);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (!webrtcRef.current || state.status !== 'active') return;

    if (isRecording) {
      // Stop recording but keep chunks in memory
      webrtcRef.current.stopRecording();
      log('User stopped recording');
      setIsRecording(false);
    } else {
      // Start recording
      if (remoteEncPubKeyRef.current && encryptionKeypairRef.current) {
        log('User started recording');
        webrtcRef.current.startRecording({
          recipientPubKey: remoteEncPubKeyRef.current,
          senderSecretKey: encryptionKeypairRef.current.secretKey
        });
        setIsRecording(true);
      } else {
        log('Cannot start recording: missing keys');
      }
    }
  }, [isRecording, state.status, log]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (!webrtcRef.current) return;

    if (isScreenSharing) {
      await webrtcRef.current.stopScreenShare();
      setIsScreenSharing(false);
      log('User stopped screen share');
    } else {
      try {
        await webrtcRef.current.startScreenShare();
        setIsScreenSharing(true);
        log('User started screen share');
      } catch (err) {
        log('Failed to start screen share', err);
        return; // Failed to start
      }
    }
    
    // Update local stream state for UI
    setLocalStream(webrtcRef.current.getLocalStream());

  }, [isScreenSharing, log]);

  // Clean recording state if muted? No, independent.

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (subscriptionRef.current !== null && connection) {
        connection.removeAccountChangeListener(subscriptionRef.current).catch(() => {});
      }
    };
  }, [cleanup, connection]);

  return {
    status: state.status,
    callId: state.callId,
    remotePubkey: state.remotePubkey,
    isOutgoing: state.isOutgoing,
    isMuted,
    isVideoEnabled,
    localStream,
    remoteStream,
    webrtcState,
    isRecording,
    isScreenSharing,
    error: state.error,

    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleRecording,
    toggleScreenShare,

    isReady: !!connection && !!writerCtx && !!userPubkey && tableReady,
  };
}
