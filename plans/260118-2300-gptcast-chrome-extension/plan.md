---
title: "GPTCast Chrome Extension"
description: "Chrome extension converting ChatGPT conversations to podcast audio"
status: in-progress (Phase 4 next)
priority: P1
effort: 16h
branch: main
tags: [chrome-extension, tts, gemini, audio, podcast]
created: 2026-01-18
---

# GPTCast Chrome Extension - Implementation Plan

## Overview

Transform ChatGPT conversations into engaging podcast audio with expressive TTS and background music. Full client-side architecture using Gemini APIs.

## Architecture

```
Content Script (chatgpt.com) ──┐
                               │ message passing
Popup UI ──────────────────────┼──→ Service Worker ──→ Gemini APIs
                               │        │
                               │        ▼
                               └──→ Offscreen Document
                                    (Web Audio + MediaRecorder)
                                         │
                                         ▼
                                    MP3 Download
```

## Phases

| Phase | Title | Effort | Status |
|-------|-------|--------|--------|
| 1 | [Extension Scaffold](./phase-01-extension-scaffold.md) | 2h | completed (2026-01-18T23:45:00Z) |
| 2 | [DOM Extraction](./phase-02-dom-extraction.md) | 2h | completed (2026-01-18T23:47:00Z) [Report](../reports/code-reviewer-260118-2343-phase2-dom-extraction.md) |
| 3 | [Script Generation](./phase-03-script-generation.md) | 3h | completed (2026-01-18T23:55:00Z) [Report](../reports/code-reviewer-260118-2349-phase3-script-generation.md) |
| 4 | [TTS Audio Generation](./phase-04-tts-audio-generation.md) | 3h | completed (2026-01-19T00:06:00Z) [Review](./reports/phase-04-code-review.md) |
| 5 | [Audio Mixing & Export](./phase-05-audio-mixing-export.md) | 4h | pending |
| 6 | [UI Polish](./phase-06-ui-polish.md) | 2h | pending |

## Key Technical Decisions

- **TTS**: Gemini TTS with natural language emotion prompting
- **Script Gen**: Gemini Flash for conversation-to-podcast transformation
- **Audio Mixing**: Web Audio API in Offscreen Document
- **Music**: Bundled Pixabay royalty-free tracks (3-5 moods)
- **Storage**: chrome.storage.local with Web Crypto encryption for API keys

## Research Reports

- [TTS & Audio Research](../reports/researcher-260118-2247-chatgpt-to-podcast-tts-audio-research.md)
- [Architecture Brainstorm](../reports/brainstorm-260118-2247-gptcast-chrome-extension.md)
- [Chrome MV3 Audio](./research/researcher-01-chrome-mv3-audio.md)
- [Gemini API Integration](./research/researcher-02-gemini-api-integration.md)

## Dependencies

- Google Gemini API key (user-provided)
- Chrome browser (Manifest V3 support)
- chatgpt.com DOM structure (verified selectors)

## Success Criteria

1. Extract any ChatGPT conversation successfully
2. Generate engaging podcast script (not robotic)
3. Produce natural-sounding TTS with emotions
4. Mix speech with music (auto-ducking)
5. Export as downloadable MP3
6. Complete workflow in <2 min for 10-message conversation

---

## Validation Summary

**Validated:** 2026-01-18
**Questions asked:** 5

### Confirmed Decisions

| Decision | User Choice | Impact |
|----------|-------------|--------|
| Audio export format | **Add MP3 encoding** | Bundle lamejs (~150KB) for direct MP3 output |
| Long conversation merge | **Simple merge with pauses** | Join chunks with 1s pause, no extra LLM call |
| Music source | **Bundled only (MVP)** | 3 tracks: calm, upbeat, ambient |
| TTS fallback | **Gemini only, fail gracefully** | Clear error if format changes, no secondary TTS |
| DOM resilience | **Multiple fallback selectors** | 3-4 selector patterns before failing |

### Action Items

- [ ] **Phase 5**: Add lamejs library for MP3 encoding (update audio-mixer.js)
- [ ] **Phase 2**: Implement 3-4 fallback DOM selector patterns
- [ ] **Phase 5**: Update export logic to output MP3 instead of WebM
