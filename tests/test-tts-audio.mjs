#!/usr/bin/env node
/**
 * Simple TTS Audio Test
 * Tests Gemini TTS API and verifies audio output is non-empty
 *
 * Usage: GEMINI_API_KEY=your-key node test-tts-audio.mjs
 */

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY environment variable required');
  process.exit(1);
}

const MODEL = 'gemini-2.5-flash-preview-tts';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function testTTS() {
  console.log('🎤 Testing Gemini TTS...\n');
  console.log(`Model: ${MODEL}`);
  console.log(`Text: "Hello, this is a test of Gemini TTS."\n`);

  const body = {
    contents: [{ parts: [{ text: 'Hello, this is a test of Gemini TTS.' }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }
        }
      }
    }
  };

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('❌ API Error:', response.status, error.error?.message || 'Unknown');
      process.exit(1);
    }

    const data = await response.json();

    // Check response structure
    const candidate = data.candidates?.[0];
    if (!candidate) {
      console.error('❌ No candidates in response');
      console.log('Response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const audioPart = candidate.content?.parts?.find(
      p => p.inlineData?.mimeType?.startsWith('audio/')
    );

    if (!audioPart) {
      console.error('❌ No audio part in response');
      console.log('Parts:', JSON.stringify(candidate.content?.parts, null, 2));
      process.exit(1);
    }

    const audioData = audioPart.inlineData.data;
    const mimeType = audioPart.inlineData.mimeType;

    // Verify audio data
    if (!audioData || audioData.length === 0) {
      console.error('❌ Audio data is empty!');
      process.exit(1);
    }

    // Decode and check size
    const audioBytes = Buffer.from(audioData, 'base64');

    console.log('✅ Audio received successfully!');
    console.log(`   MIME type: ${mimeType}`);
    console.log(`   Base64 length: ${audioData.length} chars`);
    console.log(`   Decoded size: ${audioBytes.length} bytes`);
    console.log(`   Duration estimate: ~${(audioBytes.length / 48000).toFixed(2)}s`);

    // Save test output
    const fs = await import('fs');

    // Create WAV header
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + audioBytes.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(24000, 24);
    header.writeUInt32LE(48000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(audioBytes.length, 40);

    const wav = Buffer.concat([header, audioBytes]);
    fs.writeFileSync('test-output.wav', wav);
    console.log(`\n📁 Saved to: test-output.wav (${wav.length} bytes)`);
    console.log('\n🎧 Play it with: afplay test-output.wav (macOS)');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testTTS();
