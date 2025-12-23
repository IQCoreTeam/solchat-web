import { encryptBytesForRecipient } from './encryption';

/**
 * WebRTC Manager
 *
 * Handles WebRTC peer connection for voice calls.
 * Signaling is done on-chain, audio is peer-to-peer.
 */

import { ICE_SERVERS } from './types';


export type WebRTCState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface WebRTCManagerConfig {
  // Called with BATCHED candidates after gathering completes (or after timeout)
  onIceCandidates: (candidates: RTCIceCandidate[]) => void;
  onConnectionStateChange: (state: WebRTCState) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onError: (error: string) => void;
  debug?: boolean;
}

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private config: WebRTCManagerConfig;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  // Recording
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Uint8Array[] = []; // Encrypted chunks
  private rawRecordedChunks: Blob[] = []; // Playable raw chunks
  private recordedMimeType: string = 'audio/webm'; // Default fallback
  private encryptionKeys: { recipientPubKey: Uint8Array; senderSecretKey: Uint8Array } | null = null;

  // ICE candidate batching - collect until explicitly flushed or gathering completes
  private iceCandidateBuffer: RTCIceCandidate[] = [];
  private iceGatheringComplete = false;
  private iceFlushed = false; // Track if we've already flushed

  constructor(config: WebRTCManagerConfig) {
    this.config = config;
  }

  private log(...args: unknown[]) {
    if (this.config.debug !== false) {
      console.log('[WebRTCManager]', ...args);
    }
  }

  /**
   * Filter ICE candidates to only essential ones
   * We need to be very aggressive to fit in a single Solana transaction (~1KB limit)
   * Each candidate is ~150-200 bytes serialized, so max 2-3 candidates
   */
  private filterIceCandidates(candidates: RTCIceCandidate[]): RTCIceCandidate[] {
    // Prioritize: srflx (STUN) > relay (TURN) > host
    // srflx is the public IP from STUN - most important for NAT traversal
    const srflx = candidates.filter(c => c.candidate.includes('srflx'));
    const relay = candidates.filter(c => c.candidate.includes('relay'));
    const host = candidates.filter(c => c.candidate.includes('host'));

    // Take only the minimum needed - max 2 total to fit in transaction
    // Prefer: 1 srflx (best for NAT), 1 host (fallback for local network)
    const filtered: RTCIceCandidate[] = [];

    if (srflx.length > 0) {
      filtered.push(srflx[0]); // One STUN candidate
    }
    if (relay.length > 0 && filtered.length < 2) {
      filtered.push(relay[0]); // One TURN candidate if we have room
    }
    if (host.length > 0 && filtered.length < 2) {
      filtered.push(host[0]); // One host candidate if we have room
    }

    this.log(`Filtered ${candidates.length} candidates down to ${filtered.length} (picked: ${filtered.map(c => c.candidate.includes('srflx') ? 'srflx' : c.candidate.includes('relay') ? 'relay' : 'host').join(', ')})`);
    return filtered;
  }

  /**
   * Flush buffered ICE candidates - filter and send in batch
   * This is called explicitly after SDP is sent, or when gathering completes
   */
  private flushIceCandidates(): void {
    // Prevent duplicate flushes
    if (this.iceFlushed) {
      this.log('ICE already flushed, skipping');
      return;
    }

    if (this.iceCandidateBuffer.length === 0) {
      this.log('No ICE candidates to flush');
      return;
    }

    this.iceFlushed = true;

    const allCandidates = [...this.iceCandidateBuffer];
    this.iceCandidateBuffer = [];

    // Filter to essential candidates only
    const filtered = this.filterIceCandidates(allCandidates);

    if (filtered.length > 0) {
      this.log('Sending', filtered.length, 'ICE candidates (filtered from', allCandidates.length, ')');
      this.config.onIceCandidates(filtered);
    }
  }

  /**
   * Public method to explicitly flush ICE candidates
   * Call this AFTER SDP has been sent to ensure proper ordering
   */
  flushIceCandidatesNow(): void {
    this.log('Explicit ICE flush requested');
    this.flushIceCandidates();
  }

  /**
   * Initialize the peer connection
   */
  async initialize(video: boolean = false): Promise<void> {
    this.log('Initializing peer connection...', video ? '(Video Enabled)' : '(Audio Only)');

    this.pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });

    // Handle ICE candidates - buffer them until explicitly flushed
    // We don't use a timeout here - instead, flushIceCandidatesNow() is called
    // after SDP is sent to ensure proper ordering of on-chain signals
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.log('ICE candidate buffered:', event.candidate.candidate.slice(0, 40));
        this.iceCandidateBuffer.push(event.candidate);
      }
    };

    // Handle ICE gathering state change
    this.pc.onicegatheringstatechange = () => {
      this.log('ICE gathering state:', this.pc?.iceGatheringState);
      if (this.pc?.iceGatheringState === 'complete') {
        this.iceGatheringComplete = true;
        // Flush any remaining candidates
        this.flushIceCandidates();
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState as WebRTCState;
      this.log('Connection state:', state);
      this.config.onConnectionStateChange(state);
    };

    // Handle ICE connection state
    // IMPORTANT: Sometimes connectionState stays "connecting" even when ICE is connected
    // So we also check iceConnectionState and report "connected" when ICE connects
    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc?.iceConnectionState;
      this.log('ICE connection state:', iceState);

      // If ICE is connected/completed but connectionState hasn't updated, force the callback
      if (iceState === 'connected' || iceState === 'completed') {
        const connState = this.pc?.connectionState;
        if (connState !== 'connected') {
          this.log('ICE connected but connectionState is:', connState, '- forcing connected state');
          this.config.onConnectionStateChange('connected');
        }
      } else if (iceState === 'failed') {
        this.config.onConnectionStateChange('failed');
      } else if (iceState === 'disconnected') {
        this.config.onConnectionStateChange('disconnected');
      }
    };

    // Handle remote stream
    this.pc.ontrack = (event) => {
      this.log('Remote track received:', event.track.kind, 'id:', event.track.id);
      this.log('Track readyState:', event.track.readyState, 'muted:', event.track.muted);
      this.log('Streams count:', event.streams.length);

      // Track when audio starts flowing (unmutes)
      event.track.onunmute = () => {
        this.log('Remote track unmuted - audio should be flowing now');
      };
      event.track.onmute = () => {
        this.log('Remote track muted');
      };
      event.track.onended = () => {
        this.log('Remote track ended');
      };

      if (event.streams[0]) {
        const stream = event.streams[0];
        this.log('Received stream id:', stream.id);
        this.log('Local stream id:', this.localStream?.id || 'none');
        this.log('Track IDs - received:', event.track.id, 'local:', this.localStream?.getAudioTracks()[0]?.id || 'none');

        // Verify this is NOT our local stream (check both stream and track IDs)
        if (this.localStream) {
          if (stream.id === this.localStream.id) {
            this.log('WARNING: Received local stream as remote (stream ID match)! Ignoring.');
            return;
          }
          const localTrackId = this.localStream.getAudioTracks()[0]?.id;
          if (localTrackId && event.track.id === localTrackId) {
            this.log('WARNING: Received local track as remote (track ID match)! Ignoring.');
            return;
          }
        }

        // Create a new MediaStream for the remote track to ensure clean state
        const remoteStream = new MediaStream([event.track]);
        this.remoteStream = remoteStream;
        
        this.config.onRemoteStream(remoteStream);
        this.playRemoteStream(remoteStream);

        // If recording was requested before stream arrived, restart it with new stream
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
           this.log('Restarting recording with new remote stream');
           this.startRecording(this.encryptionKeys!);
        }
      }
    };

    // Get local audio stream
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: 'user' } : false,
      });

      // Add local tracks to peer connection
      this.localStream.getTracks().forEach((track) => {
        if (this.pc && this.localStream) {
          this.pc.addTrack(track, this.localStream);
        }
      });

      this.log('Local stream acquired, tracks added');
    } catch (error) {
      this.config.onError('Failed to access microphone');
      throw error;
    }
  }

  /**
   * Create an SDP offer (caller side)
   */
  async createOffer(): Promise<string> {
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await this.pc.setLocalDescription(offer);
    this.log('Created offer, SDP length:', offer.sdp?.length);

    return offer.sdp || '';
  }

  /**
   * Handle incoming SDP offer (callee side)
   */
  async handleOffer(sdp: string): Promise<string> {
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    const offer: RTCSessionDescriptionInit = {
      type: 'offer',
      sdp,
    };

    await this.pc.setRemoteDescription(offer);
    this.log('Set remote offer');

    // Process any pending ICE candidates
    await this.processPendingCandidates();

    // Create answer
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.log('Created answer, SDP length:', answer.sdp?.length);

    return answer.sdp || '';
  }

  /**
   * Handle incoming SDP answer (caller side)
   */
  async handleAnswer(sdp: string): Promise<void> {
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    const answer: RTCSessionDescriptionInit = {
      type: 'answer',
      sdp,
    };

    await this.pc.setRemoteDescription(answer);
    this.log('Set remote answer');

    // Process any pending ICE candidates
    await this.processPendingCandidates();
  }

  /**
   * Add an ICE candidate from remote peer
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      this.log('Queuing ICE candidate (PC not ready)');
      this.pendingCandidates.push(candidate);
      return;
    }

    if (!this.pc.remoteDescription) {
      this.log('Queuing ICE candidate (no remote description)');
      this.pendingCandidates.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(candidate);
      this.log('Added ICE candidate');
    } catch (error) {
      this.log('Failed to add ICE candidate:', error);
    }
  }

  /**
   * Process queued ICE candidates
   */
  private async processPendingCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return;

    this.log('Processing', this.pendingCandidates.length, 'pending candidates');

    for (const candidate of this.pendingCandidates) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (error) {
        this.log('Failed to add pending candidate:', error);
      }
    }

    this.pendingCandidates = [];
  }

  /**
   * Play remote audio stream
   */
  private playRemoteStream(stream: MediaStream): void {
    this.log('playRemoteStream called, stream id:', stream.id);

    // If stream has video, let the UI handle playback via <video> element
    if (stream.getVideoTracks().length > 0) {
      this.log('Stream has video tracks - skipping internal audio-only playback');
      return;
    }

    if (this.remoteAudio) {
      this.log('Cleaning up previous audio element');
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }

    this.remoteAudio = new Audio();
    this.remoteAudio.srcObject = stream;
    this.remoteAudio.autoplay = true;

    // Add event listeners to debug audio playback
    this.remoteAudio.onplay = () => this.log('Audio element started playing');
    this.remoteAudio.onpause = () => this.log('Audio element paused');
    this.remoteAudio.onerror = (e) => this.log('Audio element error:', e);

    this.remoteAudio.play().then(() => {
      this.log('Remote audio play() succeeded');
    }).catch((error) => {
      this.log('Failed to play remote audio:', error);
    });

    this.log('Playing remote stream, audio element created');
  }

  /**
   * Mute/unmute local audio
   */
  setMuted(muted: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      this.log('Muted:', muted);
    }
  }

  /**
   * Check if currently muted
   */
  get isMuted(): boolean {
    if (!this.localStream) return true;
    const track = this.localStream.getAudioTracks()[0];
    return track ? !track.enabled : true;
  }

  /**
   * Toggle local video
   */
  setVideoEnabled(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
      this.log('Video enabled:', enabled);
    }
  }

  /**
   * Check if video is enabled
   */
  get isVideoEnabled(): boolean {
    if (!this.localStream) return false;
    const track = this.localStream.getVideoTracks()[0];
    return track ? track.enabled : false;
  }

  /**
   * Get local stream
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Get connection state
   */
  get state(): WebRTCState {
    return (this.pc?.connectionState as WebRTCState) || 'closed';
  }

  /**
   * Close the connection and release resources
   */
  /**
   * Start recording the *remote* stream
   * Encrypts chunks on the fly
   */
  startRecording(keys: { recipientPubKey: Uint8Array; senderSecretKey: Uint8Array }): void {
    if (!this.remoteStream) {
      this.log('Cannot start recording: no remote stream yet');
      this.encryptionKeys = keys; // Store for later
      return;
    }

    this.log('Starting call recording...');
    this.encryptionKeys = keys;
    this.recordedChunks = [];
    this.rawRecordedChunks = [];

    // Detect supported MIME type, preferring MP4 (AAC) for compatibility
    const mimeTypes = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm'
    ];
    
    let selectedType = 'audio/webm';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedType = type;
        break;
      }
    }
    this.recordedMimeType = selectedType;
    this.log('Using MIME type for recording:', selectedType);

    try {
      this.mediaRecorder = new MediaRecorder(this.remoteStream, { mimeType: selectedType });
      
      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          try {
            // 1. Keep raw blob for playable download
            this.rawRecordedChunks.push(e.data);

            // 2. Encrypt for proof
            const buffer = await e.data.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            
            // Encrypt using the session keys (creates a recoverable proof)
            const { encrypted } = encryptBytesForRecipient(
              bytes,
              keys.recipientPubKey,
              keys.senderSecretKey
            );
            
            this.recordedChunks.push(encrypted);
            this.log(`Recorded chunk: ${bytes.length} bytes -> ${encrypted.length} encrypted`);
          } catch (err) {
            this.log('Failed to encrypt chunk:', err);
          }
        }
      };

      this.mediaRecorder.start(1000); // 1-second chunks
    } catch (error) {
      this.log('Failed to start MediaRecorder:', error);
    }
  }

  /**
   * Stop recording and return encrypted chunks, raw blobs, and used MIME type
   */
  stopRecording(): { encrypted: Uint8Array[], raw: Blob[], mimeType: string } {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.log('Stopped recording');
    }
    return {
      encrypted: this.recordedChunks,
      raw: this.rawRecordedChunks,
      mimeType: this.recordedMimeType
    };
  }

  /**
   * Get current recorded chunks
   */
  getRecordedChunks(): { encrypted: Uint8Array[], raw: Blob[], mimeType: string } {
    return {
      encrypted: this.recordedChunks,
      raw: this.rawRecordedChunks,
      mimeType: this.recordedMimeType
    };
  }

  close(): void {
    this.log('Closing...');
    
    // Stop recording
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.recordedChunks = [];
    this.rawRecordedChunks = [];

    // Reset ICE state
    this.iceCandidateBuffer = [];
    this.iceGatheringComplete = false;
    this.iceFlushed = false;

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Stop remote audio
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
    
    // Clear refs
    this.remoteStream = null;

    // Close peer connection
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.pendingCandidates = [];
    this.log('Closed');
  }
}

