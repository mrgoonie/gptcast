/**
 * Audio Utilities Tests
 * Tests for PCM/WAV conversion and audio buffer operations
 */

import {
  base64ToArrayBuffer,
  arrayBufferToBase64,
  createWavHeader,
  pcmToWav,
  generateSilenceBuffer,
  mergeArrayBuffers
} from '../audio-utils.js';

// Mock constants for testing
const TTS_CONSTANTS = {
  SAMPLE_RATE: 24000,
  CHANNELS: 1,
  BITS_PER_SAMPLE: 16
};

describe('Audio Utilities', () => {
  describe('base64ToArrayBuffer', () => {
    it('should convert base64 string to ArrayBuffer', () => {
      const base64 = btoa('hello');
      const result = base64ToArrayBuffer(base64);
      expect(result instanceof ArrayBuffer).toBe(true);
    });

    it('should preserve data after conversion', () => {
      const originalText = 'test data';
      const base64 = btoa(originalText);
      const buffer = base64ToArrayBuffer(base64);
      const bytes = new Uint8Array(buffer);
      let decodedText = '';
      for (let i = 0; i < bytes.length; i++) {
        decodedText += String.fromCharCode(bytes[i]);
      }
      expect(decodedText).toBe(originalText);
    });

    it('should handle empty string', () => {
      const base64 = btoa('');
      const result = base64ToArrayBuffer(base64);
      expect(result.byteLength).toBe(0);
    });

    it('should handle special characters', () => {
      const text = 'Special!@#$%^&*()';
      const base64 = btoa(text);
      const buffer = base64ToArrayBuffer(base64);
      const bytes = new Uint8Array(buffer);
      let decodedText = '';
      for (let i = 0; i < bytes.length; i++) {
        decodedText += String.fromCharCode(bytes[i]);
      }
      expect(decodedText).toBe(text);
    });
  });

  describe('arrayBufferToBase64', () => {
    it('should convert ArrayBuffer to base64 string', () => {
      const text = 'hello';
      const buffer = new TextEncoder().encode(text);
      const base64 = arrayBufferToBase64(buffer.buffer);
      expect(typeof base64).toBe('string');
      expect(atob(base64)).toBe(text);
    });

    it('should handle empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      const result = arrayBufferToBase64(buffer);
      expect(result).toBe('');
    });

    it('should be reversible with base64ToArrayBuffer', () => {
      const originalText = 'test data for reversibility';
      const buffer = new TextEncoder().encode(originalText);
      const base64 = arrayBufferToBase64(buffer.buffer);
      const recovered = base64ToArrayBuffer(base64);
      const recoveredBytes = new Uint8Array(recovered);
      const recoveredText = new TextDecoder().decode(recoveredBytes);
      expect(recoveredText).toBe(originalText);
    });

    it('should handle binary data', () => {
      const bytes = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const base64 = arrayBufferToBase64(bytes.buffer);
      const recovered = base64ToArrayBuffer(base64);
      const recoveredBytes = new Uint8Array(recovered);
      expect(recoveredBytes).toEqual(bytes);
    });
  });

  describe('createWavHeader', () => {
    it('should create 44-byte WAV header', () => {
      const header = createWavHeader(1000);
      expect(header.byteLength).toBe(44);
    });

    it('should start with RIFF identifier', () => {
      const header = createWavHeader(1000);
      const view = new DataView(header);
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );
      expect(riff).toBe('RIFF');
    });

    it('should have WAVE type', () => {
      const header = createWavHeader(1000);
      const view = new DataView(header);
      const wave = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11)
      );
      expect(wave).toBe('WAVE');
    });

    it('should have fmt chunk', () => {
      const header = createWavHeader(1000);
      const view = new DataView(header);
      const fmt = String.fromCharCode(
        view.getUint8(12),
        view.getUint8(13),
        view.getUint8(14),
        view.getUint8(15)
      );
      expect(fmt).toBe('fmt ');
    });

    it('should have data chunk', () => {
      const header = createWavHeader(1000);
      const view = new DataView(header);
      const data = String.fromCharCode(
        view.getUint8(36),
        view.getUint8(37),
        view.getUint8(38),
        view.getUint8(39)
      );
      expect(data).toBe('data');
    });

    it('should set correct PCM format (1)', () => {
      const header = createWavHeader(1000);
      const view = new DataView(header);
      const format = view.getUint16(20, true);
      expect(format).toBe(1);
    });

    it('should set correct channel count', () => {
      const header = createWavHeader(1000, 24000, 1);
      const view = new DataView(header);
      const channels = view.getUint16(22, true);
      expect(channels).toBe(1);
    });

    it('should set correct sample rate', () => {
      const sampleRate = 24000;
      const header = createWavHeader(1000, sampleRate);
      const view = new DataView(header);
      const rate = view.getUint32(24, true);
      expect(rate).toBe(sampleRate);
    });

    it('should set correct bits per sample', () => {
      const header = createWavHeader(1000, 24000, 1, 16);
      const view = new DataView(header);
      const bits = view.getUint16(34, true);
      expect(bits).toBe(16);
    });

    it('should calculate correct byte rate', () => {
      const sampleRate = 24000;
      const channels = 1;
      const bitsPerSample = 16;
      const header = createWavHeader(1000, sampleRate, channels, bitsPerSample);
      const view = new DataView(header);
      const byteRate = view.getUint32(28, true);
      const expected = sampleRate * channels * (bitsPerSample / 8);
      expect(byteRate).toBe(expected);
    });

    it('should calculate correct file size', () => {
      const dataLength = 5000;
      const header = createWavHeader(dataLength);
      const view = new DataView(header);
      const fileSize = view.getUint32(4, true);
      expect(fileSize).toBe(36 + dataLength);
    });

    it('should set correct data chunk size', () => {
      const dataLength = 3000;
      const header = createWavHeader(dataLength);
      const view = new DataView(header);
      const chunkSize = view.getUint32(40, true);
      expect(chunkSize).toBe(dataLength);
    });

    it('should use default parameters when not provided', () => {
      const header1 = createWavHeader(1000);
      const header2 = createWavHeader(1000, 24000, 1, 16);
      expect(header1).toEqual(header2);
    });
  });

  describe('pcmToWav', () => {
    it('should combine header and PCM data', () => {
      const pcmData = new Uint8Array([0, 1, 2, 3, 4, 5]).buffer;
      const result = pcmToWav(pcmData);
      expect(result instanceof ArrayBuffer).toBe(true);
    });

    it('should create correct total size', () => {
      const pcmSize = 1000;
      const pcmData = new ArrayBuffer(pcmSize);
      const result = pcmToWav(pcmData);
      expect(result.byteLength).toBe(44 + pcmSize);
    });

    it('should start with RIFF header', () => {
      const pcmData = new ArrayBuffer(100);
      const result = pcmToWav(pcmData);
      const view = new DataView(result);
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );
      expect(riff).toBe('RIFF');
    });

    it('should preserve PCM data at correct offset', () => {
      const pcmArray = new Uint8Array([10, 20, 30, 40, 50]);
      const pcmData = pcmArray.buffer;
      const result = pcmToWav(pcmData);
      const resultArray = new Uint8Array(result);
      for (let i = 0; i < pcmArray.length; i++) {
        expect(resultArray[44 + i]).toBe(pcmArray[i]);
      }
    });

    it('should use custom sample rate', () => {
      const pcmData = new ArrayBuffer(100);
      const customRate = 44100;
      const result = pcmToWav(pcmData, customRate);
      const view = new DataView(result);
      const rate = view.getUint32(24, true);
      expect(rate).toBe(customRate);
    });
  });

  describe('generateSilenceBuffer', () => {
    it('should create buffer with correct size', () => {
      const duration = 1; // 1 second
      const sampleRate = 24000;
      const channels = 1;
      const bitsPerSample = 16;

      const buffer = generateSilenceBuffer(duration, sampleRate, channels, bitsPerSample);
      const expectedSize = (duration * sampleRate * channels * (bitsPerSample / 8));
      expect(buffer.byteLength).toBe(expectedSize);
    });

    it('should scale with duration', () => {
      const buffer1 = generateSilenceBuffer(1, 24000, 1, 16);
      const buffer2 = generateSilenceBuffer(2, 24000, 1, 16);
      expect(buffer2.byteLength).toBe(buffer1.byteLength * 2);
    });

    it('should scale with sample rate', () => {
      const buffer1 = generateSilenceBuffer(1, 24000, 1, 16);
      const buffer2 = generateSilenceBuffer(1, 48000, 1, 16);
      expect(buffer2.byteLength).toBe(buffer1.byteLength * 2);
    });

    it('should scale with channel count', () => {
      const buffer1 = generateSilenceBuffer(1, 24000, 1, 16);
      const buffer2 = generateSilenceBuffer(1, 24000, 2, 16);
      expect(buffer2.byteLength).toBe(buffer1.byteLength * 2);
    });

    it('should contain zeros', () => {
      const buffer = generateSilenceBuffer(0.1, 24000, 1, 16);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < view.length; i++) {
        expect(view[i]).toBe(0);
      }
    });

    it('should use default parameters', () => {
      const buffer1 = generateSilenceBuffer(1);
      const buffer2 = generateSilenceBuffer(1, 24000, 1, 16);
      expect(buffer1.byteLength).toBe(buffer2.byteLength);
    });

    it('should handle fractional durations', () => {
      const duration = 0.5;
      const sampleRate = 24000;
      const buffer = generateSilenceBuffer(duration, sampleRate, 1, 16);
      const expectedSize = Math.floor(duration * sampleRate * 1 * 2);
      expect(buffer.byteLength).toBe(expectedSize);
    });
  });

  describe('mergeArrayBuffers', () => {
    it('should combine multiple buffers', () => {
      const buf1 = new Uint8Array([1, 2, 3]).buffer;
      const buf2 = new Uint8Array([4, 5, 6]).buffer;
      const result = mergeArrayBuffers([buf1, buf2]);
      expect(result.byteLength).toBe(6);
    });

    it('should preserve data order', () => {
      const buf1 = new Uint8Array([1, 2, 3]).buffer;
      const buf2 = new Uint8Array([4, 5, 6]).buffer;
      const buf3 = new Uint8Array([7, 8, 9]).buffer;
      const result = mergeArrayBuffers([buf1, buf2, buf3]);
      const resultArray = new Uint8Array(result);
      expect(Array.from(resultArray)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle single buffer', () => {
      const buf = new Uint8Array([1, 2, 3]).buffer;
      const result = mergeArrayBuffers([buf]);
      expect(result.byteLength).toBe(3);
      const resultArray = new Uint8Array(result);
      expect(Array.from(resultArray)).toEqual([1, 2, 3]);
    });

    it('should handle empty array', () => {
      const result = mergeArrayBuffers([]);
      expect(result.byteLength).toBe(0);
    });

    it('should handle buffers of different sizes', () => {
      const buf1 = new Uint8Array([1, 2]).buffer;
      const buf2 = new Uint8Array([3, 4, 5, 6]).buffer;
      const buf3 = new Uint8Array([7]).buffer;
      const result = mergeArrayBuffers([buf1, buf2, buf3]);
      const resultArray = new Uint8Array(result);
      expect(Array.from(resultArray)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('should handle empty buffers in array', () => {
      const buf1 = new Uint8Array([1, 2]).buffer;
      const buf2 = new ArrayBuffer(0);
      const buf3 = new Uint8Array([3, 4]).buffer;
      const result = mergeArrayBuffers([buf1, buf2, buf3]);
      const resultArray = new Uint8Array(result);
      expect(Array.from(resultArray)).toEqual([1, 2, 3, 4]);
    });

    it('should handle large number of buffers', () => {
      const buffers = [];
      let expected = [];
      for (let i = 0; i < 100; i++) {
        const data = [i];
        buffers.push(new Uint8Array(data).buffer);
        expected.push(i);
      }
      const result = mergeArrayBuffers(buffers);
      const resultArray = new Uint8Array(result);
      expect(Array.from(resultArray)).toEqual(expected);
    });
  });
});
