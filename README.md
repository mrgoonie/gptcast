# GPTCast - Transform Conversations into Podcasts

Turn ChatGPT conversations into professional podcast audio with one click. GPTCast uses AI-driven script generation and expressive text-to-speech to create engaging audio content from your written discussions.

## Features

- **Conversation Extraction** - Automatically extract conversations from ChatGPT
- **AI Script Generation** - Transform conversations into narrative podcast scripts using Gemini Flash
- **Expressive TTS** - Generate natural speech with emotional prompts using 5 distinct voices
- **Background Music** - Mix speech with auto-ducking background music (calm, upbeat, ambient, or none)
- **One-Click Export** - Download your podcast as a single WAV file

## Quick Start

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/mrgoonie/gptcast.git
   cd gptcast/gptcast-extension
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (top right corner)

4. Click "Load unpacked" and select the `gptcast-extension` folder

### Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key
3. Copy the key and paste it in the extension settings

### Usage

1. Open a ChatGPT conversation at `chatgpt.com`
2. Click the GPTCast extension icon
3. Click "Extract Conversation"
4. Configure your preferences:
   - **Voice**: Choose from 5 different voices (Puck, Kore, Charon, Fenrir, Aoede)
   - **Background Music**: Calm, Upbeat, Ambient, or None
   - **Condensed Mode**: For shorter output on long conversations
5. Click "Generate Podcast"
6. Wait for processing (script → TTS → mixing) - typically 15-25 seconds
7. Download starts automatically when complete

## Voice Options

| Voice | Style | Use Case |
|-------|-------|----------|
| **Puck** | Upbeat, energetic | Dynamic, engaging topics |
| **Kore** | Firm, authoritative | Educational, informative |
| **Charon** | Warm, friendly | Conversational, personal |
| **Fenrir** | Deep, contemplative | Philosophical, thoughtful |
| **Aoede** | Bright, cheerful | Fun, lighthearted |

## Architecture

GPTCast is built as a Chrome Extension (Manifest V3) with these components:

- **Popup UI** - User interface for conversation selection and generation
- **Content Script** - Extracts conversations from ChatGPT using DOM parsing
- **Service Worker** - Coordinates the full pipeline (script → TTS → audio)
- **Gemini API Client** - Handles text generation and TTS with resilience
- **Audio Mixer** - Combines speech with background music using Web Audio API
- **Offscreen Document** - Runs audio processing in a Web Audio context

For detailed architecture information, see [docs/system-architecture.md](./docs/system-architecture.md).

## Documentation

- **[Project Overview & PDR](./docs/project-overview-pdr.md)** - Vision, features, requirements, and roadmap
- **[Codebase Summary](./docs/codebase-summary.md)** - Directory structure and file mappings
- **[Code Standards](./docs/code-standards.md)** - Naming conventions, patterns, and development guidelines
- **[System Architecture](./docs/system-architecture.md)** - Component design and data flow
- **[Project Roadmap](./docs/project-roadmap.md)** - Development status and future plans

## Technology Stack

- **Chrome Extension MV3** - Modern manifest with service workers
- **Google Gemini API** - Text generation and TTS
- **Web Audio API** - OfflineAudioContext for fast audio mixing
- **Chrome APIs** - Storage, messaging, downloads, offscreen documents
- **IndexedDB** - Large audio data transfer between contexts
- **AES-GCM** - Encrypted API key storage

## Security

- API keys are encrypted with AES-GCM (256-bit) before storage
- Encryption key generated per-installation with random IV
- All audio processing happens locally in your browser
- No external file uploads or cloud storage
- No telemetry or tracking

## Performance

- **Script Generation**: 5-10 seconds per conversation
- **TTS Generation**: 2-3 seconds per segment
- **Audio Mixing**: 1-5 seconds per hour of content (OfflineAudioContext renders at CPU speed)
- **Total Pipeline**: ~15-25 seconds for typical conversation

## Development

### Prerequisites
- Node.js 18+
- Chrome browser

### Setup

```bash
# Clone and install
git clone https://github.com/mrgoonie/gptcast.git
cd gptcast/gptcast-extension
npm install

# Run tests
npm test

# Load unpacked extension in Chrome for development
# chrome://extensions → Load unpacked → select gptcast-extension folder
```

### Project Structure

```
gptcast-extension/
├── src/
│   ├── background/       # Service worker + API clients
│   ├── content/          # ChatGPT DOM extraction
│   ├── offscreen/        # Web Audio mixing
│   ├── popup/            # Extension UI
│   └── shared/           # Utilities + constants
├── manifest.json         # MV3 manifest
└── jest.config.js        # Test configuration
```

For detailed development guidelines, see [docs/code-standards.md](./docs/code-standards.md).

## Roadmap

**Phase 1** (Complete)
- Conversation extraction from ChatGPT
- AI-driven script generation
- Expressive text-to-speech
- Audio mixing with ducking
- One-click export

**Phase 2** (Planned Q2 2026)
- Support for Discord, Slack, Email threads
- Audio format options (MP3, AAC)
- Batch podcast generation
- Custom music upload

**Phase 3** (Planned Q4 2026)
- Interactive script editor
- Speaker diarization
- Cloud sync
- Podcast hosting integration

See [docs/project-roadmap.md](./docs/project-roadmap.md) for detailed roadmap.

## Known Limitations

1. Service worker may sleep during long TTS chains (workaround: use condensed mode)
2. ChatGPT DOM changes may require selector updates
3. Silent fallback for failed audio segments (not obvious to user)
4. Sequential podcast generation only (no concurrent mixes)

## License

MIT - See LICENSE file for details

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`feature/your-feature`)
3. Make your changes with tests
4. Submit a pull request with description

See [docs/code-standards.md](./docs/code-standards.md) for development guidelines.

## Credits

- Built with [Google Gemini API](https://ai.google.dev/)
- Background music from [Pixabay](https://pixabay.com/music/)
- Chrome Extension icons and UI design

## Support

- **Issues**: [GitHub Issues](https://github.com/mrgoonie/gptcast/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mrgoonie/gptcast/discussions)
- **Email**: Contact via repository

---

**Current Version**: 1.0
**Status**: Stable (ready for Chrome Web Store)
**Last Updated**: January 19, 2026
