# Research Report: Chrome Extension Manifest V3 Audio Handling

**Date:** 2026-01-18 | **Research Type:** Technical Patterns & Best Practices

## Executive Summary

Chrome Extension Manifest V3 requires offscreen documents for audio processing since service workers lack DOM access and audio playback capabilities. Audio workflows use message passing to coordinate between service worker (business logic) and offscreen document (audio operations). For sensitive data like API keys, avoid plaintext storage—encrypt with Web Crypto API before storing in chrome.storage.local.

## Key Findings

### 1. Offscreen Document Architecture

**Creation & Lifecycle:**
- Single offscreen document per extension (chrome.offscreen API)
- Minimal DOM scope, restricted permissions
- Available since Chrome 109 (stable in Chrome 116+)
- Only runtime API accessible from offscreen documents

**Audio Operations Pattern:**
```javascript
// Service Worker (manifest.json requires "offscreen" permission)
chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: ['AUDIO_PLAYBACK'], // or 'DISPLAY_MEDIA' for recording
  justification: 'Audio playback in background'
});

// Offscreen Document (offscreen.html)
chrome.runtime.onMessage.addListener(async (msg, sender, respond) => {
  if (msg.action === 'play') {
    const audio = new Audio(msg.audioUrl);
    audio.play();
    respond({status: 'playing'});
  }
});
```

**Why Offscreen?**
- Service workers suspend/terminate—continuous audio breaks
- DOM APIs (Audio, Canvas, etc.) unavailable in service workers
- Offscreen documents stay alive during audio operations
- No visible UI interruption for user

### 2. Web Audio API in Offscreen Context

**Supported APIs:**
- MediaRecorder for audio capture/export
- Web Audio API (AudioContext, nodes, mixing)
- MediaStream API for microphone/tab audio
- MediaStreamAudioDestinationNode for mixing sources

**Audio Mixing Pattern (Multi-Source Recording):**
```javascript
// Offscreen Document
const audioContext = new AudioContext();
const micStream = await navigator.mediaDevices.getUserMedia({audio: true});
const tabStream = await chrome.tabCapture.getMediaStreamId({consumerTabId: tabId});

const micSource = audioContext.createMediaStreamSource(micStream);
const tabSource = audioContext.createMediaStreamSource(tabStream);
const destination = audioContext.createMediaStreamDestination();

micSource.connect(destination);
tabSource.connect(destination);

const mediaRecorder = new MediaRecorder(destination.stream);
mediaRecorder.ondataavailable = (e) => {
  const blob = e.data;
  chrome.runtime.sendMessage({action: 'audioReady', blob: blob});
};
mediaRecorder.start();
```

**Key Constraint:** MediaRecorder handles one audio track—multi-source mixing requires AudioContext node routing.

### 3. Service Worker Message Passing Coordination

**Architecture:**
```
Service Worker ←→ (chrome.runtime.sendMessage) ←→ Offscreen Document
                  (chrome.runtime.onMessage)
```

**Messaging Patterns:**

1. **One-Time Messages (Single Response):**
```javascript
// Service Worker → Offscreen
chrome.runtime.sendMessage({
  action: 'startRecording',
  constraints: {audio: true, video: false}
}, (response) => {
  console.log('Recording started:', response.recordingId);
});

// Offscreen → Service Worker (listener)
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.action === 'startRecording') {
    const recordingId = startMediaRecorder(msg.constraints);
    respond({recordingId, timestamp: Date.now()});
  }
});
```

2. **Long-Lived Connections (Streaming Data):**
```javascript
// Service Worker
const port = chrome.runtime.connect({name: 'audio-stream'});
port.postMessage({action: 'streamAudio'});
port.onMessage.addListener((msg) => {
  if (msg.type === 'audioChunk') {
    // Handle incoming audio blob
    saveAudioChunk(msg.blob);
  }
});

// Offscreen Document
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'audio-stream') {
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      port.postMessage({type: 'audioChunk', blob: e.data});
    };
  }
});
```

**Limitation:** Only JSON-serializable data. Blobs converted via Blob→ArrayBuffer→string transfer patterns (use structured clone for large data).

### 4. Chrome Storage for Sensitive Data

**Storage Architecture:**
- chrome.storage.local: User's device only (not synced)
- chrome.storage.sync: Synced across Chrome profile
- No built-in encryption by default
- Vulnerable to XSS if extension has content script holes

**API Key Storage Pattern (Encrypted):**
```javascript
// Encrypt before storage
async function storeApiKey(apiKey, userPassword) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userPassword),
    {name: 'PBKDF2'},
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt: new Uint8Array(16), iterations: 100000, hash: 'SHA-256'},
    keyMaterial,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    encoder.encode(apiKey)
  );

  chrome.storage.local.set({
    apiKey: {
      ciphertext: Array.from(encrypted),
      iv: Array.from(iv),
      algorithm: 'AES-GCM'
    }
  });
}

// Decrypt on retrieval
async function getApiKey(userPassword) {
  const stored = await chrome.storage.local.get('apiKey');
  // Reverse encryption with password
}
```

**Best Practices:**
- Never store raw API keys in chrome.storage
- Encrypt with user password or service-derived key
- Use Web Crypto API (browser native, no dependencies)
- Clear from memory after use: `key = null`
- Store short-lived tokens instead of permanent credentials
- Prefer session tokens with auto-expiry over static keys

**Alternative: No Local Storage:**
- Cache API token in memory only (lost on service worker suspension)
- Request token on-demand from backend
- Trade-off: Reduced privacy (every operation requires server call)

### 5. Security Considerations

**Audio Capture Permissions:**
- chrome.tabCapture requires activeTab permission
- Microphone access triggers browser permission UI
- No background audio capture without user gesture

**Data Isolation:**
- Offscreen document is same-origin as extension
- Cannot be accessed from content scripts (XSS attack vector)
- Message passing is serialized—no reference sharing

**Storage Risks:**
- Extension files accessible if device compromised
- Synced storage syncs to all Chrome profiles
- No automatic encryption unless manually implemented

## Code Pattern Quick Reference

| Operation | Location | Pattern |
|-----------|----------|---------|
| Audio playback | Offscreen doc | new Audio() + play() |
| Mic recording | Offscreen doc | getUserMedia() + MediaRecorder |
| Tab audio capture | Offscreen doc + Service Worker | chrome.tabCapture.getMediaStreamId() (async) |
| Audio export | Offscreen doc | Blob from mediaRecorder.ondataavailable |
| Message to offscreen | Service Worker | chrome.runtime.sendMessage() |
| Message from offscreen | Offscreen doc listener | chrome.runtime.onMessage.addListener() |
| API key storage | Service Worker | crypto.subtle.encrypt() → chrome.storage.local |
| API key retrieval | Service Worker | chrome.storage.local.get() → crypto.subtle.decrypt() |

## Common Pitfalls

1. **Service Worker Suspension:** Don't rely on continuous audio in service worker—use offscreen document with persistent MediaRecorder
2. **Unencrypted Secrets:** Avoid storing API keys as plaintext in chrome.storage
3. **Blob Serialization:** Messages can't send Blob objects directly—convert to ArrayBuffer or base64
4. **Permission Mismatch:** Offscreen document inherits extension permissions, not user's web permissions
5. **Tab Audio Timing:** chrome.tabCapture.getMediaStreamId() requires user gesture (click event)

## Implementation Checklist

- [ ] Add `"offscreen"` permission to manifest.json
- [ ] Create offscreen.html with minimal DOM (single div or canvas)
- [ ] Implement offscreen.js with chrome.runtime.onMessage listener
- [ ] Use chrome.offscreen.createDocument() from service worker
- [ ] For audio input: Implement Web Crypto encryption before storage
- [ ] For audio export: Blob → ArrayBuffer → base64 or direct upload
- [ ] Test service worker suspension scenarios
- [ ] Test message passing with large audio blobs

## Sources

- [Offscreen Documents - Chrome for Developers](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3)
- [chrome.offscreen API Reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Message Passing - Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Audio Recording & Screen Capture](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
- [MediaRecorder API - Chrome Blog](https://developer.chrome.com/blog/mediarecorder/)
- [Web Crypto API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Chrome Storage Encryption Discussion](https://www.codestudy.net/blog/chrome-extension-encrypting-data-to-be-stored-in-chrome-storage/)

## Unresolved Questions

1. **Blob Transfer Performance:** No benchmarks found for transferring large audio blobs via message passing—practical size limits unknown
2. **Offscreen Document Memory:** No documented limits on offscreen document lifetime or memory consumption
3. **Multi-Format Export:** MediaRecorder codec support varies by Chrome version—version matrix not centralized
4. **Encryption Key Derivation:** No official Chrome recommendation for password-to-key derivation (PBKDF2 iterations, salt size)
