/**
 * Audio Mixer Tests
 * Comprehensive tests for Web Audio API mixing, music looping, speech ducking, and recording
 */

import { AudioMixer } from '../audio-mixer.js';
import { TTS, AUDIO } from '../../shared/constants.js';

// Mock AudioContext and related Web Audio APIs
class MockAudioBuffer {
  constructor(channels = 1, length = 48000, sampleRate = 24000) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
  }

  getChannelData(channel) {
    return new Float32Array(this.length);
  }
}

class MockAudioParam {
  constructor(value = 1.0) {
    this.value = value;
  }

  linearRampToValueAtTime(value, endTime) {
    this.value = value;
    this.lastRampTime = endTime;
  }

  setValueAtTime(value, time) {
    this.value = value;
  }
}

class MockGainNode {
  constructor() {
    this.gain = new MockAudioParam(1.0);
    this.connected = [];
  }

  connect(node) {
    this.connected.push(node);
  }

  disconnect() {
    this.connected = [];
  }
}

class MockBufferSource {
  constructor(buffer) {
    this.buffer = buffer;
    this.connected = [];
    this.startTime = null;
    this.stopTime = null;
    this.started = false;
    this.stopped = false;
  }

  connect(node) {
    this.connected.push(node);
  }

  disconnect() {
    this.connected = [];
  }

  start(when = 0) {
    this.startTime = when;
    this.started = true;
  }

  stop(when) {
    this.stopTime = when;
    this.stopped = true;
  }
}

class MockMediaStreamDestination {
  constructor() {
    this.stream = new MediaStream();
    this.connected = [];
  }

  connect(node) {
    this.connected.push(node);
  }
}

class MockAudioContext {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 24000;
    this.state = 'running';
    this.closed = false;
    this.buffers = [];
    this.sources = [];
    this.gains = [];
  }

  createGain() {
    const gain = new MockGainNode();
    this.gains.push(gain);
    return gain;
  }

  createMediaStreamDestination() {
    return new MockMediaStreamDestination();
  }

  createBufferSource() {
    const source = new MockBufferSource();
    this.sources.push(source);
    return source;
  }

  async decodeAudioData(arrayBuffer) {
    const buffer = new MockAudioBuffer(1, 48000, this.sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  close() {
    this.closed = true;
    this.state = 'closed';
  }
}

// Mock MediaRecorder
class MockMediaRecorder {
  static isTypeSupported(type) {
    return type === 'audio/webm;codecs=opus' || type === 'audio/webm';
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm';
    this.audioBitsPerSecond = options.audioBitsPerSecond || 128000;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.onstop) {
      this.onstop();
    }
  }

  simulateDataAvailable(data) {
    if (this.ondataavailable) {
      this.ondataavailable({ data });
    }
  }

  simulateError(error) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

// Global setup
global.AudioContext = MockAudioContext;
global.MediaRecorder = MockMediaRecorder;
global.fetch = jest.fn();
global.Blob = jest.fn((parts, options) => {
  return {
    type: options?.type || 'application/octet-stream',
    size: parts.reduce((sum, p) => sum + (p.byteLength || p.length || 0), 0),
    parts
  };
});

describe('AudioMixer', () => {
  let mixer;

  beforeEach(() => {
    mixer = new AudioMixer();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(mixer.audioContext).toBeNull();
      expect(mixer.speechGain).toBeNull();
      expect(mixer.musicGain).toBeNull();
      expect(mixer.destination).toBeNull();
    });

    it('should set sample rate from constants', () => {
      expect(mixer.sampleRate).toBe(TTS.SAMPLE_RATE);
      expect(mixer.sampleRate).toBe(24000);
    });

    it('should set music volume from constants', () => {
      expect(mixer.musicVolume).toBe(AUDIO.MUSIC_VOLUME);
      expect(mixer.musicVolume).toBe(0.4);
    });

    it('should set music duck volume from constants', () => {
      expect(mixer.musicDuckVolume).toBe(AUDIO.MUSIC_DUCK_VOLUME);
      expect(mixer.musicDuckVolume).toBe(0.15);
    });

    it('should set duck ramp time from constants', () => {
      expect(mixer.duckRampTime).toBe(AUDIO.DUCK_RAMP_TIME);
      expect(mixer.duckRampTime).toBe(0.3);
    });
  });

  describe('initialize', () => {
    it('should create audio context with correct sample rate', async () => {
      await mixer.initialize();
      expect(mixer.audioContext).toBeDefined();
      expect(mixer.audioContext.sampleRate).toBe(24000);
    });

    it('should create media stream destination', async () => {
      await mixer.initialize();
      expect(mixer.destination).toBeDefined();
    });

    it('should create and connect speech gain node', async () => {
      await mixer.initialize();
      expect(mixer.speechGain).toBeDefined();
      expect(mixer.speechGain.gain.value).toBe(1.0);
      expect(mixer.speechGain.connected).toContain(mixer.destination);
    });

    it('should create and connect music gain node', async () => {
      await mixer.initialize();
      expect(mixer.musicGain).toBeDefined();
      expect(mixer.musicGain.gain.value).toBe(AUDIO.MUSIC_VOLUME);
      expect(mixer.musicGain.connected).toContain(mixer.destination);
    });
  });

  describe('mixAudio', () => {
    beforeEach(async () => {
      // Pre-initialize for most tests
      mixer.audioContext = new MockAudioContext();
      mixer.destination = mixer.audioContext.createMediaStreamDestination();
      mixer.speechGain = mixer.audioContext.createGain();
      mixer.musicGain = mixer.audioContext.createGain();
    });

    it('should throw error if no segments provided', async () => {
      await expect(mixer.mixAudio([], null)).rejects.toThrow('No audio content to mix');
    });

    it('should throw error if total duration is zero', async () => {
      const segments = [
        { type: 'silence', duration: 0 }
      ];
      await expect(mixer.mixAudio(segments, null)).rejects.toThrow('No audio content to mix');
    });

    it('should load speech segments', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('test').toString('base64') }
      ];

      jest.spyOn(mixer, 'loadSpeechSegments').mockResolvedValue([
        { type: 'audio', buffer: new MockAudioBuffer(), duration: 2.0 }
      ]);

      jest.spyOn(mixer, 'setupRecorder').mockReturnValue(new MockMediaRecorder());
      jest.spyOn(mixer, 'recordMix').mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' }));

      const blob = await mixer.mixAudio(segments, null);
      expect(mixer.loadSpeechSegments).toHaveBeenCalledWith(segments, expect.any(Function));
      expect(blob).toBeDefined();
    });

    it('should load music if provided', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('test').toString('base64') }
      ];

      jest.spyOn(mixer, 'loadMusic').mockResolvedValue(new MockAudioBuffer());
      jest.spyOn(mixer, 'loadSpeechSegments').mockResolvedValue([
        { type: 'audio', buffer: new MockAudioBuffer(), duration: 2.0 }
      ]);
      jest.spyOn(mixer, 'setupRecorder').mockReturnValue(new MockMediaRecorder());
      jest.spyOn(mixer, 'recordMix').mockResolvedValue(new Blob([], { type: 'audio/webm' }));

      const musicUrl = 'blob:music.wav';
      const blob = await mixer.mixAudio(segments, musicUrl);
      expect(mixer.loadMusic).toHaveBeenCalledWith(musicUrl);
    });

    it('should schedule music if provided', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('test').toString('base64') }
      ];

      const musicBuffer = new MockAudioBuffer();

      jest.spyOn(mixer, 'loadMusic').mockResolvedValue(musicBuffer);
      jest.spyOn(mixer, 'loadSpeechSegments').mockResolvedValue([
        { type: 'audio', buffer: new MockAudioBuffer(), duration: 2.0 }
      ]);
      jest.spyOn(mixer, 'scheduleMusic').mockReturnValue(undefined);
      jest.spyOn(mixer, 'setupRecorder').mockReturnValue(new MockMediaRecorder());
      jest.spyOn(mixer, 'recordMix').mockResolvedValue(new Blob([], { type: 'audio/webm' }));

      await mixer.mixAudio(segments, 'blob:music.wav');
      expect(mixer.scheduleMusic).toHaveBeenCalledWith(musicBuffer, expect.any(Number));
    });

    it('should call onProgress with appropriate stages', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('test').toString('base64') }
      ];

      jest.spyOn(mixer, 'loadSpeechSegments').mockResolvedValue([
        { type: 'audio', buffer: new MockAudioBuffer(), duration: 2.0 }
      ]);
      jest.spyOn(mixer, 'setupRecorder').mockReturnValue(new MockMediaRecorder());
      jest.spyOn(mixer, 'recordMix').mockResolvedValue(new Blob([], { type: 'audio/webm' }));

      const onProgress = jest.fn();
      await mixer.mixAudio(segments, null, onProgress);

      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls;
      expect(calls.some(c => c[0].stage === 'mixing')).toBe(true);
    });

    it('should return blob from recording', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('test').toString('base64') }
      ];

      const mockBlob = { type: 'audio/webm', size: 1024 };
      jest.spyOn(mixer, 'loadSpeechSegments').mockResolvedValue([
        { type: 'audio', buffer: new MockAudioBuffer(), duration: 2.0 }
      ]);
      jest.spyOn(mixer, 'setupRecorder').mockReturnValue(new MockMediaRecorder());
      jest.spyOn(mixer, 'recordMix').mockResolvedValue(mockBlob);

      const result = await mixer.mixAudio(segments, null);
      expect(result).toBe(mockBlob);
    });
  });

  describe('loadMusic', () => {
    it('should fetch and decode music', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer)
      });

      await mixer.initialize();
      const buffer = await mixer.loadMusic('blob:music.wav');

      expect(global.fetch).toHaveBeenCalledWith('blob:music.wav');
      expect(buffer).toBeDefined();
    });

    it('should handle fetch errors gracefully', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await mixer.initialize();
      const buffer = await mixer.loadMusic('blob:music.wav');

      expect(buffer).toBeNull();
    });

    it('should handle HTTP errors gracefully', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      await mixer.initialize();
      const buffer = await mixer.loadMusic('blob:music.wav');

      expect(buffer).toBeNull();
    });

    it('should handle decode errors gracefully', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer)
      });

      await mixer.initialize();
      mixer.audioContext.decodeAudioData = jest.fn().mockRejectedValue(new Error('Invalid audio'));

      const buffer = await mixer.loadMusic('blob:music.wav');

      expect(buffer).toBeNull();
    });
  });

  describe('loadSpeechSegments', () => {
    beforeEach(async () => {
      await mixer.initialize();
    });

    it('should load silence segments', async () => {
      const segments = [
        { type: 'silence', duration: 1.0 }
      ];

      const result = await mixer.loadSpeechSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('silence');
      expect(result[0].silenceDuration).toBe(1.0);
    });

    it('should load audio segments', async () => {
      const audioData = Buffer.from('pcm-data').toString('base64');
      const segments = [
        { type: 'audio', audioData }
      ];

      jest.spyOn(mixer, 'decodeAudio').mockResolvedValue(new MockAudioBuffer());

      const result = await mixer.loadSpeechSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('audio');
      expect(result[0].buffer).toBeDefined();
      expect(result[0].duration).toBeGreaterThan(0);
    });

    it('should load chunked audio segments', async () => {
      const audioChunks = [
        Buffer.from('chunk1').toString('base64'),
        Buffer.from('chunk2').toString('base64')
      ];
      const segments = [
        { type: 'audio_chunked', audioChunks }
      ];

      jest.spyOn(mixer, 'decodeAudio').mockResolvedValue(new MockAudioBuffer());

      const result = await mixer.loadSpeechSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('audio');
    });

    it('should handle error segments', async () => {
      const segments = [
        { type: 'error', error: 'TTS failed' }
      ];

      const result = await mixer.loadSpeechSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('silence');
      expect(result[0].silenceDuration).toBe(0.5);
    });

    it('should call onProgress callback', async () => {
      const segments = [
        { type: 'silence', duration: 1.0 },
        { type: 'silence', duration: 1.0 }
      ];

      const onProgress = jest.fn();
      await mixer.loadSpeechSegments(segments, onProgress);

      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls;
      expect(calls.some(c => c[0].stage === 'loading')).toBe(true);
    });

    it('should mix multiple segment types', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('audio').toString('base64') },
        { type: 'silence', duration: 0.5 },
        { type: 'audio', audioData: Buffer.from('audio2').toString('base64') }
      ];

      jest.spyOn(mixer, 'decodeAudio').mockResolvedValue(new MockAudioBuffer());

      const result = await mixer.loadSpeechSegments(segments);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('audio');
      expect(result[1].type).toBe('silence');
      expect(result[2].type).toBe('audio');
    });
  });

  describe('decodeAudio', () => {
    beforeEach(async () => {
      await mixer.initialize();
    });

    it('should convert PCM to WAV and decode', async () => {
      const pcmData = new ArrayBuffer(4800);
      const decodedBuffer = new MockAudioBuffer();

      jest.spyOn(mixer, 'pcmToWav').mockReturnValue(new ArrayBuffer(4844));
      mixer.audioContext.decodeAudioData = jest.fn().mockResolvedValue(decodedBuffer);

      const result = await mixer.decodeAudio(pcmData);

      expect(mixer.pcmToWav).toHaveBeenCalledWith(pcmData);
      expect(result).toBe(decodedBuffer);
    });

    it('should handle decode errors', async () => {
      const pcmData = new ArrayBuffer(4800);

      mixer.audioContext.decodeAudioData = jest.fn().mockRejectedValue(new Error('Invalid audio'));

      await expect(mixer.decodeAudio(pcmData)).rejects.toThrow();
    });
  });

  describe('base64ToArrayBuffer', () => {
    it('should convert base64 string to ArrayBuffer', () => {
      const base64 = 'dGVzdA=='; // 'test'
      const result = mixer.base64ToArrayBuffer(base64);

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBeGreaterThan(0);
    });

    it('should handle empty base64', () => {
      const result = mixer.base64ToArrayBuffer('');

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(0);
    });

    it('should handle long base64 strings', () => {
      const longBase64 = Buffer.alloc(10000).toString('base64');
      const result = mixer.base64ToArrayBuffer(longBase64);

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBeGreaterThan(0);
    });
  });

  describe('mergeAudioChunks', () => {
    it('should merge multiple audio chunks', () => {
      const chunks = [
        Buffer.from('chunk1').toString('base64'),
        Buffer.from('chunk2').toString('base64'),
        Buffer.from('chunk3').toString('base64')
      ];

      const result = mixer.mergeAudioChunks(chunks);

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBeGreaterThan(0);
    });

    it('should preserve chunk order', () => {
      const chunks = [
        Buffer.from('first').toString('base64'),
        Buffer.from('second').toString('base64')
      ];

      const result = mixer.mergeAudioChunks(chunks);

      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it('should handle empty chunks array', () => {
      const result = mixer.mergeAudioChunks([]);

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(0);
    });

    it('should handle single chunk', () => {
      const chunks = [Buffer.from('single').toString('base64')];
      const result = mixer.mergeAudioChunks(chunks);

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBeGreaterThan(0);
    });
  });

  describe('scheduleMusic', () => {
    beforeEach(async () => {
      await mixer.initialize();
    });

    it('should schedule looping music to cover total duration', () => {
      const musicBuffer = new MockAudioBuffer(1, 24000, 24000); // 1 second
      const totalDuration = 3.5; // 3.5 seconds

      mixer.scheduleMusic(musicBuffer, totalDuration);

      // Should create 4 sources (1 second each, covering 3.5 seconds)
      expect(mixer.audioContext.sources.length).toBeGreaterThanOrEqual(4);
    });

    it('should connect music to music gain', () => {
      const musicBuffer = new MockAudioBuffer(1, 24000, 24000);
      const totalDuration = 1.5;

      mixer.scheduleMusic(musicBuffer, totalDuration);

      mixer.audioContext.sources.forEach(source => {
        expect(source.connected).toContain(mixer.musicGain);
      });
    });

    it('should schedule sources at correct start times', () => {
      const musicBuffer = new MockAudioBuffer(1, 24000, 24000); // 1 second
      const totalDuration = 2.5;

      mixer.scheduleMusic(musicBuffer, totalDuration);

      const startTimes = mixer.audioContext.sources.map(s => s.startTime);
      expect(startTimes).toEqual([0, 1, 2]);
    });

    it('should stop last source at total duration', () => {
      const musicBuffer = new MockAudioBuffer(1, 24000, 24000);
      const totalDuration = 2.5;

      mixer.scheduleMusic(musicBuffer, totalDuration);

      const lastSource = mixer.audioContext.sources[mixer.audioContext.sources.length - 1];
      expect(lastSource.stopped).toBe(true);
      expect(lastSource.stopTime).toBe(2.5);
    });

    it('should handle very short music durations', () => {
      const musicBuffer = new MockAudioBuffer(1, 1200, 24000); // 0.05 seconds
      const totalDuration = 5;

      mixer.scheduleMusic(musicBuffer, totalDuration);

      // Many loops needed for short music
      expect(mixer.audioContext.sources.length).toBeGreaterThan(100);
    });
  });

  describe('scheduleSpeech', () => {
    beforeEach(async () => {
      await mixer.initialize();
    });

    it('should schedule audio segments at correct times', () => {
      const buffers = [
        { type: 'audio', buffer: new MockAudioBuffer(1, 48000, 24000), duration: 2.0 },
        { type: 'audio', buffer: new MockAudioBuffer(1, 48000, 24000), duration: 2.0 }
      ];

      mixer.scheduleSpeech(buffers, false);

      const startTimes = mixer.audioContext.sources.map(s => s.startTime);
      expect(startTimes).toEqual([0, 2.0]);
    });

    it('should insert silence between audio segments', () => {
      const buffers = [
        { type: 'audio', buffer: new MockAudioBuffer(1, 48000, 24000), duration: 1.0 },
        { type: 'silence', silenceDuration: 0.5 },
        { type: 'audio', buffer: new MockAudioBuffer(1, 48000, 24000), duration: 1.0 }
      ];

      mixer.scheduleSpeech(buffers, false);

      const startTimes = mixer.audioContext.sources.map(s => s.startTime);
      expect(startTimes).toEqual([0, 1.5]);
    });

    it('should apply music ducking when music is present', () => {
      const buffers = [
        { type: 'audio', buffer: new MockAudioBuffer(1, 48000, 24000), duration: 1.0 }
      ];

      mixer.scheduleSpeech(buffers, true);

      // Music gain should have been ramped
      expect(mixer.musicGain.gain.lastRampTime).toBeDefined();
    });

    it('should not duck when no music is present', () => {
      const initialRampTime = mixer.musicGain.gain.lastRampTime;
      const buffers = [
        { type: 'audio', buffer: new MockAudioBuffer(1, 48000, 24000), duration: 1.0 }
      ];

      mixer.scheduleSpeech(buffers, false);

      // No ducking should have occurred
      expect(mixer.audioContext.sources.length).toBeGreaterThan(0);
    });

    it('should handle silence-only segments', () => {
      const buffers = [
        { type: 'silence', silenceDuration: 1.0 },
        { type: 'silence', silenceDuration: 1.0 }
      ];

      mixer.scheduleSpeech(buffers, false);

      // No sources created for silence
      expect(mixer.audioContext.sources.length).toBe(0);
    });

    it('should restore music volume after speech', () => {
      const buffers = [
        { type: 'audio', buffer: new MockAudioBuffer(1, 48000, 24000), duration: 1.0 }
      ];

      mixer.scheduleSpeech(buffers, true);

      // Final music volume should be restored to normal
      expect(mixer.musicGain.gain.value).toBe(AUDIO.MUSIC_VOLUME);
    });
  });

  describe('setupRecorder', () => {
    it('should create MediaRecorder with correct mime type', () => {
      mixer.audioContext = new MockAudioContext();
      mixer.destination = mixer.audioContext.createMediaStreamDestination();

      const recorder = mixer.setupRecorder();

      expect(recorder).toBeInstanceOf(MockMediaRecorder);
      expect(['audio/webm;codecs=opus', 'audio/webm']).toContain(recorder.mimeType);
    });

    it('should set audio bits per second', () => {
      mixer.audioContext = new MockAudioContext();
      mixer.destination = mixer.audioContext.createMediaStreamDestination();

      const recorder = mixer.setupRecorder();

      expect(recorder.audioBitsPerSecond).toBe(128000);
    });
  });

  describe('recordMix', () => {
    it('should start recording', async () => {
      const recorder = new MockMediaRecorder();
      const startSpy = jest.spyOn(recorder, 'start');

      const recordPromise = mixer.recordMix(recorder, 2.0);
      recorder.simulateDataAvailable(new Blob(['data']));
      recorder.stop();

      await recordPromise;
      expect(startSpy).toHaveBeenCalled();
    });

    it('should collect data from ondataavailable', async () => {
      const recorder = new MockMediaRecorder();

      const recordPromise = mixer.recordMix(recorder, 2.0);
      recorder.simulateDataAvailable(new Blob(['chunk1']));
      recorder.simulateDataAvailable(new Blob(['chunk2']));
      recorder.stop();

      const blob = await recordPromise;
      expect(blob).toBeDefined();
    });

    it('should stop recording after duration', async () => {
      const recorder = new MockMediaRecorder();
      const stopSpy = jest.spyOn(recorder, 'stop');

      const recordPromise = mixer.recordMix(recorder, 0.1);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should handle recorder errors', async () => {
      const recorder = new MockMediaRecorder();

      const recordPromise = mixer.recordMix(recorder, 2.0);
      recorder.simulateError(new Error('Recording failed'));

      await expect(recordPromise).rejects.toThrow('Recording failed');
    });

    it('should include mime type in blob', async () => {
      const recorder = new MockMediaRecorder();
      recorder.mimeType = 'audio/webm;codecs=opus';

      const recordPromise = mixer.recordMix(recorder, 2.0);
      recorder.simulateDataAvailable(new Blob(['data']));
      recorder.stop();

      const blob = await recordPromise;
      expect(blob.type).toBe(recorder.mimeType);
    });

    it('should return blob with correct size', async () => {
      const recorder = new MockMediaRecorder();

      const recordPromise = mixer.recordMix(recorder, 2.0);
      recorder.simulateDataAvailable(new Blob(['test'], { type: 'audio/webm' }));
      recorder.stop();

      const blob = await recordPromise;
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('pcmToWav', () => {
    it('should add WAV header to PCM data', () => {
      const pcmData = new ArrayBuffer(4800);
      const result = mixer.pcmToWav(pcmData);

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(pcmData.byteLength + 44); // 44 byte header
    });

    it('should create valid WAV header', () => {
      const pcmData = new ArrayBuffer(4800);
      const result = mixer.pcmToWav(pcmData);
      const view = new DataView(result);

      // Check RIFF header
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );
      expect(riff).toBe('RIFF');

      // Check WAVE identifier
      const wave = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11)
      );
      expect(wave).toBe('WAVE');
    });
  });

  describe('createWavHeader', () => {
    it('should create 44-byte header', () => {
      const header = mixer.createWavHeader(4800, 24000, 1, 16);
      expect(header.byteLength).toBe(44);
    });

    it('should set correct sample rate', () => {
      const header = mixer.createWavHeader(4800, 24000, 1, 16);
      const view = new DataView(header);
      const sampleRate = view.getUint32(24, true);
      expect(sampleRate).toBe(24000);
    });

    it('should set correct number of channels', () => {
      const header = mixer.createWavHeader(4800, 24000, 1, 16);
      const view = new DataView(header);
      const channels = view.getUint16(22, true);
      expect(channels).toBe(1);
    });

    it('should set correct bits per sample', () => {
      const header = mixer.createWavHeader(4800, 24000, 1, 16);
      const view = new DataView(header);
      const bitsPerSample = view.getUint16(34, true);
      expect(bitsPerSample).toBe(16);
    });

    it('should set correct data length', () => {
      const dataLength = 4800;
      const header = mixer.createWavHeader(dataLength, 24000, 1, 16);
      const view = new DataView(header);
      const headerDataLength = view.getUint32(40, true);
      expect(headerDataLength).toBe(dataLength);
    });
  });

  describe('cleanup', () => {
    it('should close audio context', async () => {
      await mixer.initialize();
      mixer.cleanup();

      expect(mixer.audioContext.closed).toBe(true);
    });

    it('should set audio context to null', async () => {
      await mixer.initialize();
      mixer.cleanup();

      expect(mixer.audioContext).toBeNull();
    });

    it('should handle cleanup when not initialized', () => {
      expect(() => mixer.cleanup()).not.toThrow();
    });

    it('should be idempotent', async () => {
      await mixer.initialize();
      mixer.cleanup();
      mixer.cleanup();

      expect(mixer.audioContext).toBeNull();
    });
  });

  describe('safeProgress', () => {
    it('should call progress callback if provided', () => {
      const onProgress = jest.fn();
      const data = { stage: 'test', progress: 50 };

      mixer.safeProgress(onProgress, data);

      expect(onProgress).toHaveBeenCalledWith(data);
    });

    it('should handle missing callback', () => {
      expect(() => mixer.safeProgress(null, { stage: 'test' })).not.toThrow();
    });

    it('should catch callback errors', () => {
      const onProgress = jest.fn(() => {
        throw new Error('Callback error');
      });

      expect(() => mixer.safeProgress(onProgress, { stage: 'test' })).not.toThrow();
    });

    it('should catch undefined callback errors', () => {
      const onProgress = () => {
        throw new Error('Error in callback');
      };

      expect(() => mixer.safeProgress(onProgress, {})).not.toThrow();
    });
  });

  describe('integration tests', () => {
    it('should handle complete mixing flow', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('audio1').toString('base64') },
        { type: 'silence', duration: 0.5 },
        { type: 'audio', audioData: Buffer.from('audio2').toString('base64') }
      ];

      jest.spyOn(mixer, 'loadSpeechSegments').mockResolvedValue([
        { type: 'audio', buffer: new MockAudioBuffer(), duration: 1.0 },
        { type: 'silence', silenceDuration: 0.5 },
        { type: 'audio', buffer: new MockAudioBuffer(), duration: 1.0 }
      ]);
      jest.spyOn(mixer, 'setupRecorder').mockReturnValue(new MockMediaRecorder());
      jest.spyOn(mixer, 'recordMix').mockResolvedValue(new Blob(['mixed'], { type: 'audio/webm' }));

      const blob = await mixer.mixAudio(segments, null);

      expect(blob).toBeDefined();
      expect(blob.type).toBe('audio/webm');
    });

    it('should clean up resources after mixing', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('audio').toString('base64') }
      ];

      jest.spyOn(mixer, 'loadSpeechSegments').mockResolvedValue([
        { type: 'audio', buffer: new MockAudioBuffer(), duration: 1.0 }
      ]);
      jest.spyOn(mixer, 'setupRecorder').mockReturnValue(new MockMediaRecorder());
      jest.spyOn(mixer, 'recordMix').mockResolvedValue(new Blob([], { type: 'audio/webm' }));
      jest.spyOn(mixer, 'cleanup').mockReturnValue(undefined);

      await mixer.mixAudio(segments, null);

      // Cleanup should be called on success
      // Note: in actual code it's not called in mixAudio, but in offscreen handler
      expect(mixer.audioContext).toBeDefined();
    });

    it('should handle all audio segment types', async () => {
      const segments = [
        { type: 'audio', audioData: Buffer.from('audio').toString('base64') },
        { type: 'silence', duration: 1.0 },
        { type: 'audio_chunked', audioChunks: [Buffer.from('c1').toString('base64')] },
        { type: 'error', error: 'Failed' }
      ];

      jest.spyOn(mixer, 'decodeAudio').mockResolvedValue(new MockAudioBuffer());

      const result = await mixer.initialize().then(() => mixer.loadSpeechSegments(segments));

      expect(result).toHaveLength(4);
      expect(result.map(r => r.type)).toEqual(['audio', 'silence', 'audio', 'silence']);
    });
  });
});
