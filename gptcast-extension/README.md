# GPTCast

Transform ChatGPT conversations into podcast audio.

## Features

- **Extract Conversations**: Automatically extract conversations from ChatGPT
- **AI Script Generation**: Transform conversations into engaging podcast scripts using Gemini Flash
- **Expressive TTS**: Generate natural speech with emotional prompts using Gemini TTS
- **Background Music**: Mix speech with auto-ducking background music
- **One-Click Export**: Download your podcast as a single audio file

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/mrgoonie/gptcast.git
   cd gptcast/gptcast-extension
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the `gptcast-extension` folder

### Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key
3. Copy the key and paste it in the extension settings

## Usage

1. Open a ChatGPT conversation at `chatgpt.com`
2. Click the GPTCast extension icon
3. Click "Extract Conversation"
4. Configure your preferences:
   - **Voice**: Choose from 5 different voices
   - **Background Music**: Calm, Upbeat, Ambient, or None
   - **Condensed Mode**: For shorter output on long conversations
5. Click "Generate Podcast"
6. Wait for processing (script → TTS → mixing)
7. Download starts automatically when complete

## Technical Architecture

```
gptcast-extension/
├── manifest.json           # Chrome Extension Manifest V3
├── src/
│   ├── background/
│   │   ├── service-worker.js   # Main coordinator
│   │   ├── gemini-client.js    # Gemini API wrapper
│   │   ├── script-generator.js # LLM script generation
│   │   └── tts-generator.js    # TTS audio generation
│   ├── content/
│   │   └── content-script.js   # DOM extraction
│   ├── offscreen/
│   │   ├── offscreen.html      # Offscreen document
│   │   ├── offscreen.js        # Message handler
│   │   └── audio-mixer.js      # Web Audio API mixing
│   ├── popup/
│   │   ├── popup.html          # Extension popup UI
│   │   ├── popup.css           # Styles
│   │   └── popup.js            # UI interactions
│   └── shared/
│       ├── constants.js        # Configuration constants
│       ├── message-types.js    # Message type definitions
│       ├── prompts.js          # LLM prompt templates
│       ├── voice-config.js     # Voice & emotion config
│       ├── audio-utils.js      # Audio conversion utils
│       └── storage-utils.js    # Encrypted storage
└── assets/
    ├── icons/                  # Extension icons
    └── music/                  # Background music tracks
```

### Key Technologies

- **Chrome Extension MV3**: Modern Manifest V3 architecture
- **Service Worker**: Background processing and API coordination
- **Offscreen Document**: Web Audio API mixing (not available in service workers)
- **Gemini Flash**: Fast LLM for script generation
- **Gemini TTS**: Natural expressive text-to-speech
- **Web Audio API**: Real-time audio mixing with auto-ducking
- **MediaRecorder API**: Audio export

## Voice Options

| Voice | Style |
|-------|-------|
| Puck | Upbeat, energetic |
| Kore | Firm, authoritative |
| Charon | Warm, friendly |
| Fenrir | Deep, contemplative |
| Aoede | Bright, cheerful |

## Development

### Prerequisites

- Node.js 18+
- Chrome browser

### Setup

```bash
# Clone the repository
git clone https://github.com/mrgoonie/gptcast.git
cd gptcast/gptcast-extension

# Install dependencies (if any)
npm install
```

### Testing

```bash
npm test
```

## Security

- API keys are encrypted with AES-GCM before storage
- Encryption key generated per-installation
- No plaintext secrets in chrome.storage
- All audio processing happens locally in your browser

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Credits

- Built with [Google Gemini API](https://ai.google.dev/)
- Background music from [Pixabay](https://pixabay.com/music/)
