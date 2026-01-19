# Project Overview & Product Development Requirements

## Vision

Transform ChatGPT conversations into professional podcast audio with one click, powered by AI-driven script generation and expressive text-to-speech.

## Target Users

- **Content Creators**: Repurpose conversations into podcast episodes
- **Educators**: Convert Q&A sessions into audio learning materials
- **Researchers**: Archive and share conversation insights as audio
- **Knowledge Workers**: Transform written discussions into audio summaries for commute consumption

## Core Features

### 1. Conversation Extraction
- Extract conversations directly from ChatGPT web interface
- Parse multi-turn exchanges while preserving context
- Support both user and assistant message roles
- Graceful fallback on ChatGPT DOM changes

### 2. Script Generation
- Transform conversations into narrative podcast scripts using Gemini Flash
- Inject emotional markers for expressive delivery
- Support condensed mode for long conversations
- Token-aware chunking for conversations exceeding API limits

### 3. Expressive Text-to-Speech
- Generate audio via Gemini TTS with emotion prompts
- 5 distinct voices: Puck, Kore, Charon, Fenrir, Aoede
- Emotion support: excited, curious, thoughtful, emphatic, warm, neutral
- Automatic text chunking at sentence boundaries

### 4. Audio Mixing
- Combine speech with background music (calm, upbeat, ambient, none)
- Automatic audio ducking: music volume reduces during speech
- Fast, offline rendering via OfflineAudioContext
- 1-hour podcast renders in <5 seconds

### 5. One-Click Export
- Download final podcast as single WAV file
- Automatic filename generation with conversation title
- No external file uploads (all processing local)

## Technical Requirements

### Architecture
- Chrome Extension Manifest V3
- Service Worker for background processing and API coordination
- Offscreen Document for Web Audio API access
- Content Script for ChatGPT DOM extraction
- Message-passing IPC between components

### External Dependencies
- **Google Gemini API**: Text generation (gemini-2.0-flash), TTS (gemini-2.5-flash-preview-tts)
- **Chrome APIs**: Storage, messaging, downloads, offscreen documents
- **Web Audio API**: AudioContext, OfflineAudioContext, BufferSource, Gain nodes
- **IndexedDB**: Large audio data transfer between service worker and offscreen context

### Performance Targets
- Script generation: 5-10s per conversation
- TTS generation: 2-3s per segment (depends on text length)
- Audio mixing: 1-5s per hour of content
- Download: <1s (data URL, local only)

### Security
- API keys encrypted with AES-GCM (256-bit, random IV per key)
- All audio processing happens locally in user's browser
- No persistent server uploads
- No telemetry or tracking

### Compatibility
- Chrome browser 90+
- Works on ChromeOS, Windows, macOS, Linux
- Responsive popup UI (360px width)
- Tested with ChatGPT conversations from 2024-2025

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Extraction Success Rate | >95% | Successful DOM parsing on ChatGPT |
| Script Generation Time | <10s | Average time for typical conversation |
| Audio Quality | Professional | User feedback on Gemini TTS voice |
| Error Recovery | >90% | Partial failures don't block pipeline |
| Install Base | Growing | Chrome Web Store ratings/reviews |
| User Retention | >30 days | Active users returning after first use |

## Constraints

### Functional
- Conversation length limited to ~400K chars before auto-chunking
- TTS max ~3500 chars per API call (split at sentence boundaries)
- Music tracks limited to 4 moods + none option
- Voice selection limited to 5 Gemini TTS voices

### Technical
- Chrome 10MB storage quota per extension
- Audio data cached in memory (not persisted, lost on SW termination)
- No concurrent podcast generation (sequential only)
- No background audio playback in Service Worker (requires offscreen doc)

### API
- Gemini API rate limits (429 responses with exponential backoff)
- 30s timeout for script generation, 90s for TTS
- Max retries: 3 attempts per operation
- Requires valid Google Cloud API key with TTS enabled

### UX
- Fixed 360px popup width (Chrome extension constraint)
- No settings persistence beyond API key (volatile state)
- 6-view state machine: initial → preview → processing → complete/error/settings

## Roadmap Status

**Phase 1 (Complete)**
- ✓ Core extraction from ChatGPT
- ✓ Script generation with emotion markers
- ✓ TTS with voice selection
- ✓ Audio mixing with ducking
- ✓ Download functionality
- ✓ API key encryption

**Phase 2 (Planned)**
- [ ] Support for additional conversation sources (Discord, Slack)
- [ ] Batch podcast generation
- [ ] Audio format options (MP3, AAC)
- [ ] Custom music upload
- [ ] Bookmarking/favorites within conversations

**Phase 3 (Future)**
- [ ] Speaker diarization (different voices per role)
- [ ] Interactive podcast editing UI
- [ ] Cloud sync for conversation history
- [ ] Public podcast hosting integration

## Known Limitations

1. **Service Worker Termination**: In-memory audio cache lost if service worker sleeps during TTS
2. **DOM Selector Brittleness**: ChatGPT DOM changes may require selector updates
3. **Silent Fallback**: Failed audio segments become silence (not obvious to user)
4. **No Concurrent Mixing**: Multiple podcast requests overwrite promise resolver
5. **Base64 Message Size**: Very large podcasts may hit message payload limits (need streamer)

## Development Status

- **Repository**: github.com/mrgoonie/gptcast
- **License**: MIT
- **Code Size**: ~3100 LOC across 20+ source files
- **Test Coverage**: Unit tests for mixer, TTS, audio utils
- **Release**: Available on Chrome Web Store (pending submission)

---

**Last Updated**: January 19, 2026
**Version**: 1.0 (Phase 1 Complete)
