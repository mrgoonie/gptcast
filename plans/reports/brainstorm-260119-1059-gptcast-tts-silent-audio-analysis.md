# GPTCast TTS Silent Audio Analysis & Architecture Brainstorm

**Date:** 2026-01-19
**Issue:** Audio output is WebM file with silence - no audio content

---

## Root Cause Analysis

### Critical Bug Found: Wrong TTS Model Name

**Current code uses:** `gemini-2.5-flash-tts`
**Correct model name:** `gemini-2.5-flash-preview-tts`

The model `gemini-2.5-flash-tts` does NOT exist. The API likely returns an empty or error response that gets silently handled as empty audio.

**Location:** `gptcast-extension/src/shared/constants.js:9`
```javascript
GEMINI_TTS_MODEL: 'gemini-2.5-flash-tts',  // WRONG
// Should be:
GEMINI_TTS_MODEL: 'gemini-2.5-flash-preview-tts',  // CORRECT
```

### Secondary Issues Identified

1. **Response Parsing May Be Wrong**
   - Current: Looking for `inlineData.data` with audio mimeType
   - The response structure matches docs, but error handling may mask failures

2. **Silent Failures**
   - `parseTTSResponse` throws error if no audio, but upstream catches and returns empty

3. **Audio Format Assumptions**
   - Code expects PCM 16-bit 24kHz - this IS correct per docs
   - WAV header creation logic appears correct

---

## Architecture Brainstorm: Client-Side vs Server-Side

### Current Approach: Client-Side Only (Chrome Extension)

**How it works:**
1. Extension extracts ChatGPT conversation
2. Extension calls Gemini API directly with user's API key
3. Extension mixes audio in offscreen document
4. Extension saves WebM file

**Pros:**
- Zero infrastructure cost
- User owns their API key/billing
- No server maintenance
- Privacy: data never leaves user's device
- Simple deployment (just Chrome Web Store)

**Cons:**
- API key exposed in extension (encrypted, but extractable)
- Limited by browser capabilities (no ffmpeg)
- WebM output only (browser MediaRecorder limitation)
- Rate limits per user API key
- Harder to debug issues

### Alternative: Server-Side TTS Generation

**How it would work:**
1. Extension extracts conversation
2. Extension sends text to YOUR server
3. Server calls Gemini TTS with YOUR API key (PROJECT_ID approach)
4. Server returns audio to extension
5. Extension plays/downloads

**Pros:**
- Better audio format options (MP3, WAV via ffmpeg)
- Single API key management (your PROJECT_ID)
- Better error handling/logging
- Could add caching for repeated segments
- Professional audio post-processing possible

**Cons:**
- Infrastructure costs (server + Gemini API usage)
- Privacy concerns (conversation data hits your server)
- Latency (round-trip to server)
- More complex architecture
- YOU pay for API usage, not users

---

## Authentication Methods Comparison

### 1. API Key (Current Approach)
```
https://generativelanguage.googleapis.com/v1beta/models/...?key=USER_API_KEY
```
- User provides their own key
- Works from browser directly
- No PROJECT_ID needed
- Good for client-side

### 2. Service Account + PROJECT_ID (Server-Side)
```
https://texttospeech.googleapis.com/v1/text:synthesize
Authorization: Bearer $(gcloud auth print-access-token)
x-goog-user-project: YOUR_PROJECT_ID
```
- Requires Google Cloud project
- Service account credentials
- Better for server-side
- More quota control

### 3. Vertex AI (Enterprise)
```
https://aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/...
```
- Requires GCP project
- More enterprise features
- Higher quotas available
- More complex setup

---

## Recommendation

### Immediate Fix (Keep Client-Side)

1. **Fix model name:** `gemini-2.5-flash-preview-tts`
2. **Add error logging:** Log actual API response to console
3. **Validate audio data:** Check if base64 is non-empty before processing

### Long-Term Considerations

**Stay client-side IF:**
- Cost-conscious (users pay own API)
- Privacy-focused product
- Small user base
- Simple feature set

**Move to server-side IF:**
- Want MP3 output format
- Need centralized billing/analytics
- Building premium features
- Want better quality control

### Hybrid Approach (Best of Both)

1. Keep client-side for free tier
2. Add optional server-side premium tier for:
   - MP3 export
   - Better voice mixing
   - Background music library
   - Podcast hosting

---

## Immediate Action Items

1. [ ] Fix `GEMINI_TTS_MODEL` to `gemini-2.5-flash-preview-tts`
2. [ ] Add console logging for API responses
3. [ ] Test with minimal example text
4. [ ] Verify base64 audio data is non-empty
5. [ ] Consider adding `gemini-2.5-pro-preview-tts` as quality option

---

## Sources

- [Gemini TTS Docs](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)
- [Speech Generation API](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Getting Started Notebook](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/audio/speech/getting-started/get_started_with_gemini_tts_voices.ipynb)
- [Cloud TTS Create Audio](https://docs.cloud.google.com/text-to-speech/docs/create-audio)
- [TTS Endpoints](https://docs.cloud.google.com/text-to-speech/docs/endpoints)
