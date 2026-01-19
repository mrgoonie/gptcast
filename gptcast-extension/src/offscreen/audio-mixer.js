/**
 * Audio Mixer
 * Handles Web Audio API mixing, ducking, and recording in offscreen document
 */
import { TTS, AUDIO } from '../shared/constants.js';

export class AudioMixer {
  constructor() {
    this.audioContext = null;
    this.speechGain = null;
    this.musicGain = null;
    this.destination = null;
    this.sampleRate = TTS.SAMPLE_RATE;
    this.musicVolume = AUDIO.MUSIC_VOLUME;
    this.musicDuckVolume = AUDIO.MUSIC_DUCK_VOLUME;
    this.duckRampTime = AUDIO.DUCK_RAMP_TIME;
  }

  async initialize() {
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    this.destination = this.audioContext.createMediaStreamDestination();

    this.speechGain = this.audioContext.createGain();
    this.speechGain.gain.value = 1.0;
    this.speechGain.connect(this.destination);

    this.musicGain = this.audioContext.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.destination);
  }

  /**
   * Mix TTS segments with background music
   */
  async mixAudio(segments, musicUrl, onProgress) {
    await this.initialize();

    this.safeProgress(onProgress, { stage: 'mixing', progress: 0, detail: 'Loading audio...' });

    const musicBuffer = musicUrl ? await this.loadMusic(musicUrl) : null;
    const speechBuffers = await this.loadSpeechSegments(segments, onProgress);

    const totalDuration = speechBuffers.reduce((sum, buf) => {
      return sum + (buf.duration || buf.silenceDuration || 0);
    }, 0);

    if (totalDuration === 0) {
      throw new Error('No audio content to mix');
    }

    console.log('[AudioMixer] Total duration:', totalDuration.toFixed(2), 'seconds');

    this.safeProgress(onProgress, { stage: 'mixing', progress: 50, detail: 'Mixing tracks...' });

    const recorder = this.setupRecorder();

    if (musicBuffer) {
      this.scheduleMusic(musicBuffer, totalDuration);
    }

    this.scheduleSpeech(speechBuffers, musicBuffer !== null);

    this.safeProgress(onProgress, { stage: 'mixing', progress: 70, detail: 'Recording...' });

    const blob = await this.recordMix(recorder, totalDuration);

    this.safeProgress(onProgress, { stage: 'mixing', progress: 100, detail: 'Complete' });

    return blob;
  }

  safeProgress(onProgress, data) {
    try {
      onProgress?.(data);
    } catch {
      // Progress callback failed, continue
    }
  }

  async loadMusic(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      return await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.warn('[AudioMixer] Failed to load music:', error);
      return null;
    }
  }

  async loadSpeechSegments(segments, onProgress) {
    const buffers = [];
    const total = segments.length;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      this.safeProgress(onProgress, {
        stage: 'loading',
        progress: Math.round((i / total) * 50),
        detail: `Loading segment ${i + 1}/${total}`
      });

      if (segment.type === 'silence') {
        buffers.push({
          type: 'silence',
          silenceDuration: segment.duration
        });
      } else if (segment.type === 'audio') {
        const audioData = this.base64ToArrayBuffer(segment.audioData);
        const buffer = await this.decodeAudio(audioData);
        buffers.push({
          type: 'audio',
          buffer,
          duration: buffer.duration
        });
      } else if (segment.type === 'audio_chunked') {
        const audioData = this.mergeAudioChunks(segment.audioChunks);
        const buffer = await this.decodeAudio(audioData);
        buffers.push({
          type: 'audio',
          buffer,
          duration: buffer.duration
        });
      } else if (segment.type === 'error') {
        // Skip failed segments, add small silence
        buffers.push({
          type: 'silence',
          silenceDuration: 0.5
        });
      }
    }

    return buffers;
  }

  async decodeAudio(arrayBuffer) {
    try {
      const wavBuffer = this.pcmToWav(arrayBuffer);
      return await this.audioContext.decodeAudioData(wavBuffer);
    } catch (error) {
      console.warn('[AudioMixer] Failed to decode audio segment:', error);
      // Return a short silence buffer as fallback
      const silenceDuration = 0.5;
      const numSamples = Math.floor(silenceDuration * this.sampleRate);
      const silenceBuffer = this.audioContext.createBuffer(1, numSamples, this.sampleRate);
      return silenceBuffer;
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
    const binary = atob(base64);
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
    for (const buffer of buffers) {
      merged.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return merged.buffer;
  }

  scheduleMusic(musicBuffer, totalDuration) {
    const loops = Math.ceil(totalDuration / musicBuffer.duration);
    const baseTime = this.audioContext.currentTime;

    for (let i = 0; i < loops; i++) {
      const source = this.audioContext.createBufferSource();
      source.buffer = musicBuffer;
      source.connect(this.musicGain);

      const startTime = baseTime + (i * musicBuffer.duration);
      source.start(startTime);

      if ((i * musicBuffer.duration) + musicBuffer.duration > totalDuration) {
        source.stop(baseTime + totalDuration);
      }
    }
  }

  scheduleSpeech(buffers, hasMusic) {
    const baseTime = this.audioContext.currentTime;
    let currentTime = 0;

    for (const buffer of buffers) {
      if (buffer.type === 'silence') {
        if (hasMusic) {
          this.musicGain.gain.linearRampToValueAtTime(
            this.musicVolume,
            baseTime + currentTime + this.duckRampTime
          );
        }
        currentTime += buffer.silenceDuration;
      } else {
        if (hasMusic) {
          this.musicGain.gain.linearRampToValueAtTime(
            this.musicDuckVolume,
            baseTime + currentTime
          );
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer.buffer;
        source.connect(this.speechGain);
        source.start(baseTime + currentTime);

        currentTime += buffer.duration;

        if (hasMusic) {
          this.musicGain.gain.linearRampToValueAtTime(
            this.musicVolume,
            baseTime + currentTime + this.duckRampTime
          );
        }
      }
    }
  }

  setupRecorder() {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    return new MediaRecorder(this.destination.stream, {
      mimeType,
      audioBitsPerSecond: 128000
    });
  }

  recordMix(recorder, duration) {
    return new Promise((resolve, reject) => {
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        console.log('[AudioMixer] Recording stopped, chunks:', chunks.length);
        const blob = new Blob(chunks, { type: recorder.mimeType });
        resolve(blob);
      };

      recorder.onerror = (e) => {
        reject(new Error('Recording failed: ' + (e.error?.message || 'Unknown error')));
      };

      recorder.start();

      // Stop after duration + adaptive buffer (5% min 2s max 10s)
      const bufferTime = Math.min(10, Math.max(2, duration * 0.05));
      console.log('[AudioMixer] Recording started, will stop in', (duration + bufferTime).toFixed(2), 'seconds');
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, (duration + bufferTime) * 1000);
    });
  }

  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
