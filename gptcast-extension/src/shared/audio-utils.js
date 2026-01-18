/**
 * Audio utility functions
 * Handles PCM/WAV conversion and audio buffer operations
 */
import { TTS } from './constants.js';

/**
 * Convert base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to base64 string
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Create WAV header for PCM data
 */
export function createWavHeader(
  dataLength,
  sampleRate = TTS.SAMPLE_RATE,
  channels = TTS.CHANNELS,
  bitsPerSample = TTS.BITS_PER_SAMPLE
) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // File length minus RIFF identifier and file description
  view.setUint32(4, 36 + dataLength, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // Format chunk identifier
  writeString(view, 12, 'fmt ');
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // Channel count
  view.setUint16(22, channels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
  // Block align (channels * bytes per sample)
  view.setUint16(32, channels * (bitsPerSample / 8), true);
  // Bits per sample
  view.setUint16(34, bitsPerSample, true);
  // Data chunk identifier
  writeString(view, 36, 'data');
  // Data chunk length
  view.setUint32(40, dataLength, true);

  return header;
}

/**
 * Write string to DataView
 */
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Convert raw PCM data to WAV format
 */
export function pcmToWav(
  pcmData,
  sampleRate = TTS.SAMPLE_RATE,
  channels = TTS.CHANNELS,
  bitsPerSample = TTS.BITS_PER_SAMPLE
) {
  const header = createWavHeader(pcmData.byteLength, sampleRate, channels, bitsPerSample);
  const wavBuffer = new Uint8Array(header.byteLength + pcmData.byteLength);
  wavBuffer.set(new Uint8Array(header), 0);
  wavBuffer.set(new Uint8Array(pcmData), header.byteLength);
  return wavBuffer.buffer;
}

/**
 * Generate silence buffer
 */
export function generateSilenceBuffer(
  durationSeconds,
  sampleRate = TTS.SAMPLE_RATE,
  channels = TTS.CHANNELS,
  bitsPerSample = TTS.BITS_PER_SAMPLE
) {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const bytesPerSample = bitsPerSample / 8;
  const bufferSize = numSamples * channels * bytesPerSample;
  return new ArrayBuffer(bufferSize);
}

/**
 * Merge multiple ArrayBuffers
 */
export function mergeArrayBuffers(buffers) {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return merged.buffer;
}
