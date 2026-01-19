/**
 * Audio Mixer
 * Handles Web Audio API mixing using OfflineAudioContext for fast, non-real-time rendering
 */
import { TTS, AUDIO } from '../shared/constants.js';

export class AudioMixer {
  constructor() {
    this.sampleRate = TTS.SAMPLE_RATE;
    this.musicVolume = AUDIO.MUSIC_VOLUME;
    this.musicDuckVolume = AUDIO.MUSIC_DUCK_VOLUME;
    this.duckRampTime = AUDIO.DUCK_RAMP_TIME;
  }

  /**
   * Mix TTS segments with background music using offline rendering
   * This is FAST - renders at CPU speed, not real-time
   */
  async mixAudio(segments, musicUrl, onProgress) {
    this.safeProgress(onProgress, { stage: 'mixing', progress: 0, detail: 'Loading audio...' });

    // Create temporary online context for decoding
    const tempContext = new AudioContext({ sampleRate: this.sampleRate });

    try {
      const musicBuffer = musicUrl ? await this.loadMusic(tempContext, musicUrl) : null;
      const speechBuffers = await this.loadSpeechSegments(tempContext, segments, onProgress);

      const totalDuration = speechBuffers.reduce((sum, buf) => {
        return sum + (buf.duration || buf.silenceDuration || 0);
      }, 0);

      if (totalDuration === 0) {
        throw new Error('No audio content to mix');
      }

      // Log buffer details for debugging
      const speechCount = speechBuffers.filter(b => b.type === 'speech').length;
      const silenceCount = speechBuffers.filter(b => b.type === 'silence').length;
      console.log('[AudioMixer] Total duration:', totalDuration.toFixed(2), 'seconds');
      console.log('[AudioMixer] Speech segments:', speechCount, 'Silence segments:', silenceCount);
      console.log('[AudioMixer] Using OFFLINE rendering (fast, not real-time)');

      this.safeProgress(onProgress, { stage: 'mixing', progress: 50, detail: 'Rendering audio...' });

      // Create offline context for rendering
      const totalSamples = Math.ceil(totalDuration * this.sampleRate);
      const offlineContext = new OfflineAudioContext(1, totalSamples, this.sampleRate);

      // Set up gain nodes
      const speechGain = offlineContext.createGain();
      speechGain.gain.value = 1.0;
      speechGain.connect(offlineContext.destination);

      const musicGain = offlineContext.createGain();
      musicGain.gain.value = this.musicVolume;
      musicGain.connect(offlineContext.destination);

      // Schedule music
      if (musicBuffer) {
        this.scheduleMusic(offlineContext, musicGain, musicBuffer, totalDuration);
      }

      // Schedule speech with ducking
      this.scheduleSpeech(offlineContext, speechGain, musicGain, speechBuffers, musicBuffer !== null);

      this.safeProgress(onProgress, { stage: 'mixing', progress: 70, detail: 'Processing...' });

      // Render offline (FAST - CPU speed, not real-time!)
      const renderedBuffer = await offlineContext.startRendering();
      const hasRenderedContent = this.hasAudioContent(renderedBuffer);
      console.log('[AudioMixer] Offline rendering complete, hasAudio:', hasRenderedContent, 'samples:', renderedBuffer.length);

      this.safeProgress(onProgress, { stage: 'mixing', progress: 90, detail: 'Encoding...' });

      // Convert to WAV blob
      const wavBlob = this.audioBufferToWav(renderedBuffer);

      this.safeProgress(onProgress, { stage: 'mixing', progress: 100, detail: 'Complete' });

      return wavBlob;
    } finally {
      tempContext.close();
    }
  }

  safeProgress(onProgress, data) {
    try {
      onProgress?.(data);
    } catch {
      // Progress callback failed, continue
    }
  }

  async loadMusic(context, url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      return await context.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.warn('[AudioMixer] Failed to load music:', error);
      return null;
    }
  }

  async loadSpeechSegments(context, segments, onProgress) {
    const buffers = [];
    const total = segments.length;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      this.safeProgress(onProgress, {
        stage: 'mixing',
        progress: Math.round((i / total) * 40),
        detail: `Loading segment ${i + 1}/${total}...`
      });

      if (segment.type === 'audio') {
        // TTS stores as 'audioData', not 'data'
        const buffer = await this.decodeSegment(context, segment.audioData);
        const hasContent = this.hasAudioContent(buffer);
        console.log(`[AudioMixer] Segment ${i}: audio, duration=${buffer.duration.toFixed(2)}s, samples=${buffer.length}, hasAudio=${hasContent}`);
        buffers.push({ type: 'speech', buffer, duration: buffer.duration });
      } else if (segment.type === 'audio_chunked') {
        // TTS stores as 'audioChunks', not 'chunks'
        const buffer = await this.decodeChunkedSegment(context, segment.audioChunks);
        const hasContent = this.hasAudioContent(buffer);
        console.log(`[AudioMixer] Segment ${i}: chunked, duration=${buffer.duration.toFixed(2)}s, samples=${buffer.length}, chunks=${segment.audioChunks.length}, hasAudio=${hasContent}`);
        buffers.push({ type: 'speech', buffer, duration: buffer.duration });
      } else if (segment.type === 'silence') {
        buffers.push({ type: 'silence', silenceDuration: segment.duration || 0.5 });
      } else if (segment.type === 'error') {
        buffers.push({ type: 'silence', silenceDuration: 0.5 });
      }
    }

    return buffers;
  }

  async decodeChunkedSegment(context, chunks) {
    const mergedBuffer = this.mergeAudioChunks(chunks);
    return this.decodeFromPCM(context, mergedBuffer);
  }

  async decodeSegment(context, base64Data) {
    if (!base64Data) {
      // Return silence buffer for missing data
      const silenceDuration = 0.5;
      const numSamples = Math.floor(silenceDuration * this.sampleRate);
      return context.createBuffer(1, numSamples, this.sampleRate);
    }
    const arrayBuffer = this.base64ToArrayBuffer(base64Data);
    return this.decodeFromPCM(context, arrayBuffer);
  }

  async decodeFromPCM(context, arrayBuffer) {
    try {
      const wavBuffer = this.pcmToWav(arrayBuffer);
      return await context.decodeAudioData(wavBuffer);
    } catch (error) {
      console.warn('[AudioMixer] Failed to decode audio segment:', error);
      const silenceDuration = 0.5;
      const numSamples = Math.floor(silenceDuration * this.sampleRate);
      return context.createBuffer(1, numSamples, this.sampleRate);
    }
  }

  pcmToWav(pcmData) {
    const header = this.createWavHeader(pcmData.byteLength, this.sampleRate);
    const wav = new Uint8Array(header.byteLength + pcmData.byteLength);
    wav.set(new Uint8Array(header), 0);
    wav.set(new Uint8Array(pcmData), header.byteLength);
    return wav.buffer;
  }

  createWavHeader(dataLength, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
    view.setUint16(32, channels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    return header;
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  base64ToArrayBuffer(base64) {
    if (!base64) {
      // Return empty buffer for undefined/null data
      return new ArrayBuffer(0);
    }
    // Handle URL-safe base64 (replace - with + and _ with /)
    let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    const binary = atob(standardBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  mergeAudioChunks(chunks) {
    const buffers = chunks.map(c => this.base64ToArrayBuffer(c));
    const totalLength = buffers.reduce((sum, b) => sum + b.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      merged.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    return merged.buffer;
  }

  scheduleMusic(context, musicGain, musicBuffer, totalDuration) {
    // Copy buffer to this context (buffers are context-specific)
    const contextBuffer = this.copyBufferToContext(context, musicBuffer);

    const source = context.createBufferSource();
    source.buffer = contextBuffer;
    source.loop = true;
    source.connect(musicGain);
    source.start(0);
    source.stop(totalDuration);
  }

  /**
   * Copy AudioBuffer to a new context (required because buffers are context-specific)
   */
  copyBufferToContext(context, sourceBuffer) {
    const newBuffer = context.createBuffer(
      sourceBuffer.numberOfChannels,
      sourceBuffer.length,
      sourceBuffer.sampleRate
    );
    for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
      const sourceData = sourceBuffer.getChannelData(channel);
      const destData = newBuffer.getChannelData(channel);
      destData.set(sourceData);
    }
    return newBuffer;
  }

  /**
   * Check if buffer has actual audio (not all zeros/silence)
   */
  hasAudioContent(buffer) {
    const data = buffer.getChannelData(0);
    let maxAbs = 0;
    // Sample every 1000th value for performance
    for (let i = 0; i < data.length; i += 1000) {
      maxAbs = Math.max(maxAbs, Math.abs(data[i]));
    }
    return maxAbs > 0.001; // threshold for "has audio"
  }

  scheduleSpeech(context, speechGain, musicGain, speechBuffers, hasMusic) {
    let currentTime = 0;

    for (const buffer of speechBuffers) {
      if (buffer.type === 'silence') {
        currentTime += buffer.silenceDuration;
      } else if (buffer.type === 'speech' && buffer.buffer) {
        if (hasMusic) {
          musicGain.gain.linearRampToValueAtTime(this.musicDuckVolume, currentTime);
        }

        // Copy buffer to this context (buffers are context-specific)
        const contextBuffer = this.copyBufferToContext(context, buffer.buffer);

        const source = context.createBufferSource();
        source.buffer = contextBuffer;
        source.connect(speechGain);
        source.start(currentTime);

        currentTime += buffer.duration;

        if (hasMusic) {
          musicGain.gain.linearRampToValueAtTime(this.musicVolume, currentTime + this.duckRampTime);
        }
      }
    }
  }

  /**
   * Convert AudioBuffer to WAV Blob
   */
  audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;

    const samples = audioBuffer.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  cleanup() {
    // No cleanup needed for offline context
  }
}
