# Phase 5: Audio Mixing & Export

## Context Links
- [Chrome MV3 Audio Research](./research/researcher-01-chrome-mv3-audio.md)
- [TTS Research - Audio Mixing](../reports/researcher-260118-2247-chatgpt-to-podcast-tts-audio-research.md)
- [Phase 4 - TTS Generation](./phase-04-tts-audio-generation.md)
- [Code Review Report](./reports/phase-05-code-review.md) ⭐

## Overview
- **Priority**: P0 (Core feature)
- **Status**: code-review-complete
- **Effort**: 4h
- **Description**: Mix TTS audio with background music using Web Audio API in offscreen document, with auto-ducking and MP3 export

## Code Review Summary (2026-01-19)
- **Grade**: B+ (Good implementation with improvement opportunities)
- **Critical Issues**: 0
- **High Priority**: 4 (timing, error handling, memory, MediaRecorder timeout)
- **Medium Priority**: 5 (base64 efficiency, race conditions, retry logic)
- **Status**: Implementation complete, testing phase required

## Key Insights

### Web Audio API in Offscreen Document
- Service workers cannot use Web Audio API (no DOM)
- Offscreen document provides isolated DOM context
- MediaStreamAudioDestinationNode for mixing multiple sources
- MediaRecorder for capturing mixed output

### Audio Ducking Strategy
Reduce background music volume when speech plays:
- Speech playing: Music at 15-20% volume
- Speech paused: Music at 40-50% volume
- Ramp time: 0.3s for smooth transitions
- 18dB reduction is podcast standard

### Export Format
- MediaRecorder supports: audio/webm, audio/ogg (Chrome)
- For MP3: Use audio/mpeg if supported, else webm→mp3 via lamejs
- Target: 128kbps MP3 for podcast distribution

## Requirements

### Functional
- Mix all TTS segments into continuous audio
- Add background music (looping)
- Auto-duck music during speech
- Generate silence for pause markers
- Export as downloadable MP3
- Trigger browser download

### Non-Functional
- Mixing completes in <30s for 5-minute podcast
- Final audio normalized to consistent levels
- No audible clicks/pops at segment boundaries
- File size reasonable (<10MB for 5 minutes)

## Architecture

```
Service Worker
      │
      │ sendMessage({type: 'MIX_AUDIO', segments, musicId})
      ▼
┌─────────────────────────────────────────┐
│  Offscreen Document (offscreen.js)       │
├─────────────────────────────────────────┤
│  AudioContext                            │
│  ├── Speech Track                        │
│  │   ├── AudioBufferSource (segment 1)   │
│  │   ├── AudioBufferSource (segment 2)   │
│  │   └── ... → GainNode → Destination    │
│  │                                        │
│  └── Music Track                          │
│      └── AudioBufferSource (loop)        │
│          → GainNode (ducking) → Dest     │
│                                          │
│  MediaStreamAudioDestinationNode         │
│  └── MediaRecorder → Blob                │
└─────────────────────────────────────────┘
      │
      │ sendMessage({type: 'AUDIO_READY', blob})
      ▼
Service Worker → chrome.downloads.download()
```

## Related Code Files

### Create
- `src/offscreen/audio-mixer.js` - Web Audio mixing logic
- `src/offscreen/mp3-encoder.js` - MP3 encoding (if needed)
- `assets/music/calm.mp3` - Bundled background track (calm mood)
- `assets/music/upbeat.mp3` - Bundled background track (energetic)
- `assets/music/ambient.mp3` - Bundled background track (subtle)

### Modify
- `src/offscreen/offscreen.js` - Implement mixing handler
- `src/background/service-worker.js` - Add download trigger

## Implementation Steps

### 1. Create audio mixer module
```javascript
// src/offscreen/audio-mixer.js
export class AudioMixer {
  constructor() {
    this.audioContext = null;
    this.speechGain = null;
    this.musicGain = null;
    this.destination = null;
    this.sampleRate = 24000;
    this.musicVolume = 0.4;
    this.musicDuckVolume = 0.15;
    this.duckRampTime = 0.3;
  }

  async initialize() {
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    this.destination = this.audioContext.createMediaStreamDestination();

    // Speech track gain
    this.speechGain = this.audioContext.createGain();
    this.speechGain.gain.value = 1.0;
    this.speechGain.connect(this.destination);

    // Music track gain
    this.musicGain = this.audioContext.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.destination);
  }

  async mixAudio(segments, musicUrl, onProgress) {
    await this.initialize();

    onProgress?.({ stage: 'mixing', progress: 0, detail: 'Loading audio...' });

    // Load background music
    const musicBuffer = musicUrl ? await this.loadMusic(musicUrl) : null;

    // Convert TTS segments to audio buffers
    const speechBuffers = await this.loadSpeechSegments(segments, onProgress);

    // Calculate total duration
    const totalDuration = speechBuffers.reduce((sum, buf) => {
      return sum + (buf.duration || buf.silenceDuration || 0);
    }, 0);

    onProgress?.({ stage: 'mixing', progress: 50, detail: 'Mixing tracks...' });

    // Setup recording
    const recorder = this.setupRecorder();

    // Schedule music (looping)
    if (musicBuffer) {
      this.scheduleMusic(musicBuffer, totalDuration);
    }

    // Schedule speech segments with ducking
    await this.scheduleSpeech(speechBuffers, musicBuffer !== null);

    onProgress?.({ stage: 'mixing', progress: 70, detail: 'Recording...' });

    // Record the mix
    const blob = await this.recordMix(recorder, totalDuration);

    onProgress?.({ stage: 'mixing', progress: 90, detail: 'Finalizing...' });

    return blob;
  }

  async loadMusic(url) {
    try {
      const response = await fetch(url);
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

      onProgress?.({
        stage: 'loading',
        progress: Math.round((i / total) * 50),
        detail: `Loading segment ${i + 1}/${total}`
      });

      if (segment.type === 'silence') {
        buffers.push({
          type: 'silence',
          silenceDuration: segment.duration
        });
      } else if (segment.type === 'audio' || segment.type === 'audio_chunked') {
        const audioData = segment.audioChunks
          ? this.mergeAudioChunks(segment.audioChunks)
          : this.base64ToArrayBuffer(segment.audioData);

        const buffer = await this.decodeAudio(audioData);
        buffers.push({
          type: 'audio',
          buffer,
          duration: buffer.duration
        });
      }
    }

    return buffers;
  }

  async decodeAudio(arrayBuffer) {
    // PCM from Gemini needs WAV header
    const wavBuffer = this.pcmToWav(arrayBuffer);
    return await this.audioContext.decodeAudioData(wavBuffer);
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

    // RIFF header
    const encoder = new TextEncoder();
    new Uint8Array(header).set(encoder.encode('RIFF'), 0);
    view.setUint32(4, 36 + dataLength, true);
    new Uint8Array(header).set(encoder.encode('WAVE'), 8);

    // fmt chunk
    new Uint8Array(header).set(encoder.encode('fmt '), 12);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
    view.setUint16(32, channels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    new Uint8Array(header).set(encoder.encode('data'), 36);
    view.setUint32(40, dataLength, true);

    return header;
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
    // Calculate loops needed
    const loops = Math.ceil(totalDuration / musicBuffer.duration);

    for (let i = 0; i < loops; i++) {
      const source = this.audioContext.createBufferSource();
      source.buffer = musicBuffer;
      source.connect(this.musicGain);

      const startTime = i * musicBuffer.duration;
      source.start(startTime);

      // Stop when podcast ends
      if (startTime + musicBuffer.duration > totalDuration) {
        source.stop(totalDuration);
      }
    }
  }

  async scheduleSpeech(buffers, hasMusic) {
    let currentTime = 0;

    for (const buffer of buffers) {
      if (buffer.type === 'silence') {
        // No audio, just advance time
        // Unduck music during silence
        if (hasMusic) {
          this.musicGain.gain.linearRampToValueAtTime(
            this.musicVolume,
            currentTime + this.duckRampTime
          );
        }
        currentTime += buffer.silenceDuration;
      } else {
        // Duck music during speech
        if (hasMusic) {
          this.musicGain.gain.linearRampToValueAtTime(
            this.musicDuckVolume,
            currentTime
          );
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer.buffer;
        source.connect(this.speechGain);
        source.start(currentTime);

        currentTime += buffer.duration;

        // Unduck after speech segment
        if (hasMusic) {
          this.musicGain.gain.linearRampToValueAtTime(
            this.musicVolume,
            currentTime + this.duckRampTime
          );
        }
      }
    }
  }

  setupRecorder() {
    // Prefer webm for browser compatibility
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
        const blob = new Blob(chunks, { type: recorder.mimeType });
        resolve(blob);
      };

      recorder.onerror = (e) => {
        reject(new Error('Recording failed: ' + e.error?.message));
      };

      recorder.start();

      // Stop after duration + buffer
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, (duration + 1) * 1000);
    });
  }

  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
```

### 2. Update offscreen.js
```javascript
// src/offscreen/offscreen.js
import { MSG } from '../shared/message-types.js';
import { AudioMixer } from './audio-mixer.js';

let mixer = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sendResponse);
  return true;
});

async function handleMessage(message, sendResponse) {
  switch (message.type) {
    case MSG.MIX_AUDIO:
      try {
        mixer = new AudioMixer();

        const blob = await mixer.mixAudio(
          message.segments,
          message.musicUrl,
          (progress) => {
            chrome.runtime.sendMessage({
              type: MSG.PROGRESS_UPDATE,
              ...progress
            });
          }
        );

        // Convert blob to base64 for message passing
        const base64 = await blobToBase64(blob);

        sendResponse({
          success: true,
          data: {
            audio: base64,
            mimeType: blob.type,
            size: blob.size
          }
        });

        mixer.cleanup();
        mixer = null;
      } catch (error) {
        console.error('[GPTCast Offscreen] Mix error:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Remove data URL prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

console.log('[GPTCast] Offscreen document ready');
```

### 3. Update service worker for download
```javascript
// Add to src/background/service-worker.js

// ... existing code ...

case MSG.AUDIO_READY:
  try {
    // Convert base64 back to blob
    const byteChars = atob(message.data.audio);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: message.data.mimeType });

    // Create download URL
    const url = URL.createObjectURL(blob);

    // Generate filename
    const { currentConversation } = await chrome.storage.local.get('currentConversation');
    const title = sanitizeFilename(currentConversation?.title || 'podcast');
    const timestamp = new Date().toISOString().slice(0, 10);
    const extension = message.data.mimeType.includes('webm') ? 'webm' : 'mp3';

    // Trigger download
    await chrome.downloads.download({
      url,
      filename: `gptcast-${title}-${timestamp}.${extension}`,
      saveAs: true
    });

    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    sendResponse({ success: true });
  } catch (error) {
    console.error('[GPTCast] Download error:', error);
    sendResponse({ success: false, error: error.message });
  }
  break;

// Add this handler for orchestrating the full pipeline
case MSG.GENERATE_PODCAST:
  try {
    await ensureOffscreenDocument();

    const { currentAudio } = await chrome.storage.local.get('currentAudio');
    if (!currentAudio) {
      sendResponse({ success: false, error: 'No audio generated' });
      return;
    }

    // Get music URL based on mood selection
    const musicUrl = getMusicUrl(message.musicMood || 'calm');

    // Send to offscreen for mixing
    chrome.runtime.sendMessage({
      type: MSG.MIX_AUDIO,
      segments: currentAudio.segments,
      musicUrl
    }, (response) => {
      if (response.success) {
        // Trigger download
        chrome.runtime.sendMessage({
          type: MSG.AUDIO_READY,
          data: response.data
        });
      }
      sendResponse(response);
    });
  } catch (error) {
    console.error('[GPTCast] Podcast generation error:', error);
    sendResponse({ success: false, error: error.message });
  }
  break;

// Helper functions
function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function getMusicUrl(mood) {
  const musicMap = {
    calm: chrome.runtime.getURL('assets/music/calm.mp3'),
    upbeat: chrome.runtime.getURL('assets/music/upbeat.mp3'),
    ambient: chrome.runtime.getURL('assets/music/ambient.mp3'),
    none: null
  };
  return musicMap[mood] || musicMap.calm;
}
```

### 4. Add bundled music files
Download royalty-free tracks from Pixabay (or similar):
- `assets/music/calm.mp3` - Soft piano or acoustic (~2 min, loop-friendly)
- `assets/music/upbeat.mp3` - Energetic electronic (~2 min, loop-friendly)
- `assets/music/ambient.mp3` - Subtle atmospheric (~2 min, loop-friendly)

Ensure tracks:
- Are royalty-free for distribution
- Have clean loop points
- Are normalized to similar levels
- Are compressed to <500KB each

### 5. Update manifest for music assets
```json
// Add to manifest.json
{
  "web_accessible_resources": [
    {
      "resources": ["assets/music/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

## Todo Checklist

### Implementation (Complete)
- [x] Create audio-mixer.js with Web Audio API logic
- [x] Implement PCM to WAV conversion
- [x] Implement audio ducking with gain ramps
- [x] Implement MediaRecorder for export
- [x] Update offscreen.js with mixing handler
- [x] Update service-worker.js with download handler
- [x] Add bundled background music tracks (3 moods)
- [x] Update manifest for music resources
- [x] Implement blob→base64 for message passing

### Code Review Actions (Identified)
- [ ] Fix AudioContext timing with currentTime offset (HIGH)
- [ ] Add error handling to decodeAudio with fallback (HIGH)
- [ ] Increase MediaRecorder timeout to adaptive 5% buffer (HIGH)
- [ ] Refactor offscreen creation lock to promise-based (MEDIUM)
- [ ] Add music load retry with user notification (MEDIUM)
- [ ] Add JSDoc types to AudioMixer methods (LOW)

### Testing (Pending Phase 6)
- [ ] Test mixing with various segment counts
- [ ] Test ducking transitions (smooth, no clicks)
- [ ] Test file download in Chrome
- [ ] Verify audio quality in exported file

## Success Criteria

1. Mixed audio plays smoothly (no clicks/pops)
2. Music ducks appropriately during speech
3. Pause markers create correct silence duration
4. Export completes in <30s for 5-minute podcast
5. Downloaded file plays in standard audio players
6. File size reasonable (<10MB for 5 minutes)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| MediaRecorder format support | Medium | Fallback to webm, convert post-download |
| Large blob message passing | Medium | Chunked transfer if needed |
| Music licensing issues | Low | Use bundled royalty-free only |
| Audio quality degradation | Medium | Use consistent sample rates, avoid resampling |

## Security Considerations

- Background music loaded from extension bundle only
- No user audio data leaves browser
- Blob URLs revoked after download
- No external dependencies for audio processing

## Next Steps

After this phase:
- Phase 6: Polish UI with progress indicators
- Add settings page for API key and preferences
- Improve error handling and user feedback
