# Gemini API Integration for Chrome Extensions
**Research Report** | 2026-01-18 | Practical Implementation Patterns

## 1. Gemini TTS API

### Authentication from Browser Context
- **API Key Source**: [AI Studio](https://aistudio.google.com/apikey) - free tier available
- **Storage Pattern**: Chrome Storage API (`chrome.storage.sync`) - local only, never shared
- **Setup Flow**: Options page retrieves key → stored locally → background.js accesses for all requests
- **Security**: No server-side key transmission required; keys stay in browser sandbox

### Audio Output Format & Handling
- **Format**: PCM base64-encoded (24kHz, 16-bit, mono)
- **Conversion**: Decode base64 → create WAV blob → use Web Audio API or HTML5 `<audio>` tag
- **Response Pattern**: Received as `{ audio: { data: "base64..." } }` in REST responses
- **Playback**: Use `AudioContext` for programmatic control or `<audio>` element for simple playback

### Multi-Speaker Configuration (Up to 2 Speakers)
```javascript
// Structure: speaker names MUST match transcript labels
const config = {
  speech_config: {
    multi_speaker_voice_config: {
      speaker_configs: [
        { speaker: "Speaker1", voice_config: { prebuilt_voice_name: "Kore" } },
        { speaker: "Speaker2", voice_config: { prebuilt_voice_name: "Puck" } }
      ]
    }
  }
};
// Transcript format: "*Speaker1* [text] *Speaker2* [text]"
```

### Emotional/Expressive Prompting
- **Natural Language Control**: "Say in spooky whisper", "sound tired and bored", "excited and happy"
- **Effective Prompt Structure**: Audio profile + scene description + director's notes + sample context + transcript
- **Voice Options**: 30 prebuilt voices (Kore=Firm, Puck=Upbeat, Enceladus=Breathy, etc.)
- **Language Support**: 24 languages with auto-detection

## 2. Gemini Flash for Text Generation

### API Endpoint for Script Generation
- **Models**: `gemini-2.5-flash-preview` (fast, cost-effective) | `gemini-2.5-pro-preview` (advanced reasoning)
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}`
- **Response Modes**:
  - Standard: Full response object with `text` field
  - Streaming: `:streamGenerateContent` endpoint for incremental chunks

### Token Limits & Chunking Strategies
- **Context Window**: 1,048,576 input tokens (Gemini 3 Flash/Pro) | 1,000,000 (Gemini 2.5 Flash)
- **Output Limit**: 65,536 tokens max per response
- **Token Math**: ~4 characters per token; 100 tokens ≈ 60-80 English words
- **Chunking for Long Scripts**:
  - Split input text into ~400k token chunks
  - Process sequentially with continuation prompts
  - Aggregate results (implement deduplication logic for overlaps)
  - Monitor `usageMetadata` for actual token consumption

### Streaming vs Batch Responses
- **Streaming** (`:streamGenerateContent`): Partial results as they generate → lower perceived latency → `usageMetadata` only on final chunk
- **Batch API**: Separate rate limits; 100 concurrent requests max; 2GB input file limit
- **Choice**: Stream for UI responsiveness; batch for large dataset processing
- **Implementation**: Use `fetch` with `ReadableStream` for streaming chunks

## 3. API Key Handling in Browser

### Direct API Calls from Extension
```javascript
// Content script or offscreen document (Manifest V3)
async function callGeminiAPI(apiKey, model, content) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: content }] }] })
    }
  );
  return response.json();
}
```
- **CORS**: Google API accepts requests from extension context (no proxy needed)
- **Storage**: Use `chrome.storage.sync` with encryption optional; avoid manifest permissions for `https://generativelanguage.googleapis.com/*`

### Rate Limits & Quotas
- **Tiers**: Free (low limits) | Tier 1 ($0+) | Tier 2 ($250+, 30 days) | Tier 3 ($1000+, 30 days)
- **Limits Dimensions**: RPM (requests/min) | TPM (tokens/min input) | RPD (requests/day)
- **Free Tier Typical**: ~15 RPM, ~32k TPM, ~1.5k RPD
- **View Limits**: [AI Studio keys page](https://aistudio.google.com/app/apikey)
- **Backoff Strategy**: Implement exponential backoff (1s → 2s → 4s) on 429 errors

### Error Handling Patterns
```javascript
// Offscreen document recommended for TTS to isolate errors
async function handleGeminiError(error) {
  if (error.status === 429) {
    // Rate limited: exponential backoff
    await delay(Math.pow(2, retryCount) * 1000);
    return retry();
  }
  if (error.status === 400) {
    // Invalid request: validate prompt length, speaker names
    chrome.runtime.sendMessage({ type: 'error', msg: 'Invalid input' });
  }
  if (error.status === 401) {
    // Invalid API key: prompt user to re-enter
    chrome.runtime.openOptionsPage();
  }
  // Network timeout: implement timeout wrapper
  Promise.race([apiCall, timeout(30000)]);
}
```

## Implementation Checklist

- [ ] Store API key in `chrome.storage.local` (encrypted optional)
- [ ] Use offscreen document for TTS (Manifest V3 requirement)
- [ ] Implement chunking for text >400k tokens
- [ ] Handle 429 rate limit with exponential backoff
- [ ] Stream responses for UI responsiveness
- [ ] Validate speaker names match transcript labels
- [ ] Decode base64 audio to WAV before playback
- [ ] Set 30s timeout on all API calls
- [ ] Monitor `usageMetadata` for token consumption

## Unresolved Questions

- Offscreen document lifecycle: Do we need to recreate for each request or persist across calls?
- Audio truncation for texts >30k tokens: Workaround beyond chunking?
- Batch API quota limits: How do free tier limits apply to batch submissions?

---

**Sources:**
- [Gemini Speech Generation](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini Models](https://ai.google.dev/gemini-api/docs/models)
- [Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini TTS Extension (GitHub)](https://github.com/PalermoAlessio/gemini-tts-extension)
