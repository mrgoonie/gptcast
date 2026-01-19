# Project Roadmap & Development Status

## Current Status: Phase 1 Complete

**Release Date**: January 2026
**Version**: 1.0
**Status**: Stable (ready for Chrome Web Store)

### Phase 1 Features (✓ Complete)

**Conversation Extraction**
- ✓ Extract from ChatGPT.com
- ✓ Multi-selector strategy (primary + fallback + last resort)
- ✓ Support user + assistant roles
- ✓ DOM parser + content script

**Script Generation**
- ✓ LLM-driven podcast script generation (Gemini Flash)
- ✓ Emotion markers: excited, curious, thoughtful, emphatic, warm, neutral
- ✓ Pause markers: `[PAUSE:X]` with 0.1-10s clamping
- ✓ Condensed mode for long conversations
- ✓ Token-aware chunking (100K threshold)
- ✓ Message-level splits (preserve context)

**Text-to-Speech**
- ✓ Gemini TTS integration (expressive voices)
- ✓ 5 voice options: Puck, Kore, Charon, Fenrir, Aoede
- ✓ Emotion-to-prompt mapping
- ✓ Batch processing (concurrent + delays)
- ✓ Sentence-level text chunking
- ✓ Silence segment generation for pauses

**Audio Mixing**
- ✓ Background music selection (calm, upbeat, ambient, none)
- ✓ Auto-ducking: music reduces during speech
- ✓ Web Audio API (OfflineAudioContext for fast rendering)
- ✓ PCM/WAV conversion
- ✓ 16-bit stereo/mono support

**Download & Export**
- ✓ One-click download (data URL)
- ✓ Auto-generated filenames (title + date)
- ✓ WAV format output
- ✓ No external server uploads

**Security & Storage**
- ✓ AES-GCM API key encryption
- ✓ Chrome storage integration
- ✓ IndexedDB for large audio data transfer
- ✓ No plaintext secrets

**UI/UX**
- ✓ 6-view state machine (initial, preview, processing, complete, error, settings)
- ✓ Progress bar with stage text
- ✓ Voice + music selection dropdowns
- ✓ Condensed mode checkbox
- ✓ Settings panel for API key
- ✓ Error messages + retry buttons
- ✓ Responsive 360px popup

## Phase 2: Extended Platform Support (Q2 2026)

### Features Planned
- [ ] **Discord Conversation Support**: Extract from Discord thread/message history
- [ ] **Slack Integration**: Export Slack threads as podcasts
- [ ] **Email Thread Parser**: Convert email chains to podcast scripts
- [ ] **Batch Generation**: Queue multiple conversations for overnight processing
- [ ] **Audio Format Options**:
  - [ ] MP3 (smaller file size)
  - [ ] AAC (streaming-friendly)
  - [ ] M4A (podcast standard)

### Architecture Changes
- Modular extraction: `extractors/{chatgpt,discord,slack,email}.js`
- Format converter layer: `formatters/{wav,mp3,aac}.js`
- Batch queue in IndexedDB with progress tracking

### Success Criteria
- Support 3 additional platforms
- Audio formats reduce file size by 70%
- Batch processing completes 10 conversations overnight
- User retention up 50%

## Phase 3: Creator Tools (Q4 2026)

### Features Planned
- [ ] **Interactive Editor**: Edit script segments before TTS
- [ ] **Speaker Diarization**: Different voices per conversation role
- [ ] **Custom Music Upload**: Supply own background tracks
- [ ] **Podcast Hosting**: Upload to Podbean/Buzzsprout via API
- [ ] **Analytics Dashboard**: Track creation stats, popular excerpts
- [ ] **Cloud Sync**: Save conversations + scripts to cloud
- [ ] **Collaboration**: Share drafts with team for feedback

### New Components
- `editor/script-editor.js` - Segment-level editing UI
- `speakers/voice-assignment.js` - Map roles to voices
- `uploaders/{podbean,buzzsprout}.js` - Hosting integrations
- `analytics/stats-tracker.js` - Usage telemetry (opt-in)

### Success Criteria
- 80% of users customize scripts before rendering
- 50% use custom music tracks
- 30% publish to external platforms
- 40% monthly active users (DAU target)

## Known Limitations & Future Fixes

### Current Limitations

**Architecture**
1. **Service Worker Termination**: In-memory audio cache lost if SW sleeps during TTS
   - Fix (Phase 2): Persist segments to IndexedDB, resume on wake
   - Risk: Medium (affects long TTS chains >10 min)

2. **DOM Selector Brittleness**: ChatGPT DOM changes break extraction
   - Workaround: Maintain fallback selectors + user bug reports
   - Fix (Phase 3): Automatic selector validation via GitHub CI

3. **Silent Fallback**: Failed audio segments become silence (not obvious)
   - Current: Track error count, warn if >10%
   - Fix (Phase 2): Visual indicators in editor for failed segments

4. **No Concurrent Mixing**: Multiple podcast requests overwrite promise resolver
   - Current: Sequential only, queued requests wait
   - Fix (Phase 2): Implement promise queue for parallel mixes

5. **Base64 Message Size**: Large podcasts hit Chrome message limits (~50MB)
   - Current: Use IndexedDB + streaming
   - Fix (Phase 3): Implement WAV streamer (chunk-based download)

### Performance Optimization Opportunities

1. **Cache Decoded Audio**: Avoid re-decoding same segments
2. **Preload Music Tracks**: Fetch on extension startup
3. **TTS Parallelization**: Increase from 3 to 5 concurrent requests (respecting 429 limits)
4. **Streaming Download**: Use Service Worker cache + fetch streams instead of blob download
5. **Script Optimization**: Pre-generate common script templates (avoid LLM call)

## Development Roadmap Timeline

| Phase | Milestone | Target | Status |
|-------|-----------|--------|--------|
| **1** | Conversation extraction | Q4 2025 | ✓ Complete |
| **1** | Script + TTS generation | Q4 2025 | ✓ Complete |
| **1** | Audio mixing + download | Q1 2026 | ✓ Complete |
| **1** | Chrome Web Store launch | Q1 2026 | In Progress |
| **2** | Platform support (Discord/Slack) | Q2 2026 | Planned |
| **2** | Audio format options | Q2 2026 | Planned |
| **2** | Batch processing | Q3 2026 | Planned |
| **3** | Interactive editor | Q3 2026 | Planned |
| **3** | Speaker diarization | Q4 2026 | Planned |
| **3** | Cloud sync + hosting integrations | Q4 2026 | Planned |

## Release Notes (v1.0)

### What's Included
- Full podcast generation from ChatGPT conversations
- 5 expressive voices with emotion markers
- 4 background music options with auto-ducking
- Fast audio mixing via OfflineAudioContext
- Encrypted API key storage
- Support for long conversations with auto-chunking

### Known Issues
1. **Issue #1**: Long TTS chains may timeout (workaround: use condensed mode)
2. **Issue #2**: ChatGPT DOM changes may require selector updates (monitor for reports)
3. **Issue #3**: Service worker sleep during generation loses cache (workaround: regenerate)

### Tested Configurations
- Chrome 90+ (Windows, macOS, ChromeOS)
- ChatGPT conversations 500-50,000 characters
- Background music: calm, upbeat, ambient
- All 5 Gemini TTS voices

### Deprecated/Removed
- Legacy plaintext API key storage (migrated to AES-GCM in v0.9)

## Contributing & Development

### Getting Started
```bash
git clone https://github.com/mrgoonie/gptcast.git
cd gptcast/gptcast-extension
npm install
npm test
npm start  # Load unpacked in Chrome
```

### Development Priorities (Next Sprint)
1. Fix silent fallback visibility (Phase 2)
2. Add telemetry for error rates (Phase 2)
3. Implement concurrent mix queue (Phase 2)
4. Begin Discord extractor prototype (Phase 2)

### Testing Requirements (Before Release)
- [ ] Unit tests >80% coverage for audio-mixer
- [ ] Integration tests for full pipeline
- [ ] Manual testing on 10+ ChatGPT conversations
- [ ] Chrome Web Store review guidelines
- [ ] Performance testing (benchmark render times)

### Code Quality Gates
- No syntax errors (eslint --fix)
- All tests passing (`npm test`)
- Coverage thresholds met (audio-mixer >90%)
- JSDoc comments on exported functions
- Conventional commit messages

## Community & Support

### User Feedback Channels
- GitHub Issues: Bug reports + feature requests
- Chrome Web Store reviews: User satisfaction
- Email: Contact form on landing page

### Contribution Guidelines
- Fork repository
- Create feature branch: `feature/your-feature`
- Submit PR with description + tests
- Code review from maintainers
- Merge after approval

## Metrics & Analytics

### Phase 1 Metrics (Current)
- Install base: TBD (pending Web Store launch)
- Average rating: TBD
- Crash rate: <0.1% (target)
- Usage (avg podcasts/user/month): TBD

### Phase 2 Goals
- Install base: 10K+
- Average rating: 4.5+/5
- Monthly active users: 5K+
- User retention: >30 days

### Phase 3 Goals
- Install base: 100K+
- Monthly active users: 30K+
- Average podcast length: 5-15 min
- Platform diversification: 40% non-ChatGPT sources

---

**Last Updated**: January 19, 2026
**Next Review**: April 19, 2026 (Phase 2 checkpoint)
