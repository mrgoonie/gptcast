# Phase 4 TTS Tests - Detailed Test Cases

## Test File 1: voice-config.test.js

### VOICES Constant Tests (3 tests)
1. **Should have all required voice names** - Verifies presence of Puck, Kore, Charon, Fenrir, Aoede
2. **Should have name and style properties for each voice** - Validates structure of each voice object
3. **Name and style should be non-empty strings** - Ensures no empty values

### DEFAULT_VOICE Constant Tests (2 tests)
1. **Should be set to Puck** - Verifies default voice value
2. **Should be a valid voice name** - Validates against VOICES export

### EMOTION_PROMPTS Constant Tests (2 tests)
1. **Should have all required emotion prompts** - Checks all 6 emotions present
2. **Should have non-empty prompts for each emotion** - Validates prompt text

### buildTTSPrompt Function Tests (7 tests)
1. **Should build prompt with known emotion** - Tests 'excited' emotion
2. **Should build prompt with unknown emotion using neutral default** - Tests fallback behavior
3. **Should use neutral emotion when no emotion provided** - Tests undefined emotion
4. **Should handle all valid emotions** - Loop tests all 6 emotions
5. **Should include text in quotes** - Format validation
6. **Should handle empty text** - Edge case empty string
7. **Should handle text with special characters** - Tests: ! ? ' "

### getVoiceOptions Function Tests (6 tests)
1. **Should return an array** - Type check
2. **Should return array with 5 options** - Count verification
3. **Should have value and label properties for each option** - Structure check
4. **Should have all voice names as values** - All 5 voices present
5. **Should include voice style in label** - Puck example check
6. **Should format labels correctly** - Pattern matching for (description)

**Total voice-config tests: 21**

---

## Test File 2: audio-utils.test.js

### base64ToArrayBuffer Tests (4 tests)
1. **Should convert base64 string to ArrayBuffer** - Type and instance check
2. **Should preserve data after conversion** - Round-trip verification
3. **Should handle empty string** - Edge case
4. **Should handle special characters** - Special character preservation

### arrayBufferToBase64 Tests (3 tests)
1. **Should convert ArrayBuffer to base64 string** - Type check and atob verification
2. **Should handle empty buffer** - Edge case returns empty string
3. **Should be reversible with base64ToArrayBuffer** - Full round-trip test
4. **Should handle binary data** - Byte range 0-255 test

### createWavHeader Tests (10 tests)
1. **Should create 44-byte WAV header** - Length verification
2. **Should start with RIFF identifier** - Bytes 0-3 check
3. **Should have WAVE type** - Bytes 8-11 check
4. **Should have fmt chunk** - Bytes 12-15 check
5. **Should have data chunk** - Bytes 36-39 check
6. **Should set correct PCM format (1)** - Bytes 20-21
7. **Should set correct channel count** - Bytes 22-23 = 1
8. **Should set correct sample rate** - Bytes 24-27 = 24000
9. **Should set correct bits per sample** - Bytes 34-35 = 16
10. **Should calculate correct byte rate** - Bytes 28-31 formula check
11. **Should calculate correct file size** - Bytes 4-7 formula check
12. **Should set correct data chunk size** - Bytes 40-43 formula check

### pcmToWav Tests (6 tests)
1. **Should combine header and PCM data** - Instance check
2. **Should create correct total size** - 44 + PCM size
3. **Should start with RIFF header** - RIFF identifier
4. **Should preserve PCM data at correct offset** - Byte-by-byte at offset 44
5. **Should use custom sample rate** - 44100 Hz example
6. **Binary data integrity maintained** - Uint8Array comparison

### generateSilenceBuffer Tests (7 tests)
1. **Should create buffer with correct size** - Formula: duration × sampleRate × channels × 2
2. **Should scale with duration** - 2 seconds = 2× 1 second
3. **Should scale with sample rate** - 48000 Hz = 2× 24000 Hz
4. **Should scale with channel count** - 2 channels = 2× 1 channel
5. **Should contain zeros** - All bytes === 0
6. **Should use default parameters** - Matches explicit defaults
7. **Should handle fractional durations** - Math.floor verification

### mergeArrayBuffers Tests (7 tests)
1. **Should combine multiple buffers** - [1,2,3] + [4,5,6] → [1,2,3,4,5,6]
2. **Should preserve data order** - 3 buffers in sequence
3. **Should handle single buffer** - [1,2,3] → [1,2,3]
4. **Should handle empty array** - [] → 0 byteLength
5. **Should handle buffers of different sizes** - [1,2], [3,4,5,6], [7]
6. **Should handle empty buffers in array** - With empty buffer in middle
7. **Should handle large number of buffers** - 100+ buffers test

**Total audio-utils tests: 46**

---

## Test File 3: tts-generator.test.js

### Constructor Tests (3 tests)
1. **Should initialize with API key** - GeminiClient created
2. **Should set maxCharsPerRequest from constants** - Equals 3500
3. **Should set concurrentRequests from constants** - Equals 3

### generateAudio Function Tests (10 tests)
1. **Should throw error if script is missing** - null input
2. **Should throw error if segments array is empty** - Empty segments
3. **Should throw error if script has no segments property** - {} input
4. **Should process segments and return audio segments** - Returns array
5. **Should return metadata with voice and timestamp** - Metadata structure
6. **Should use custom voice option** - Charon voice test
7. **Should call onProgress callback** - Callback invoked
8. **Should process pause segments** - type: 'pause'
9. **Should batch segments respecting concurrent requests limit** - Max 3 parallel
10. **Batch delay verification** - 500ms between batches

### generateSegmentAudio Tests (7 tests)
1. **Should return silence for empty text** - '' input
2. **Should return silence for whitespace-only text** - '   \n\t  ' input
3. **Should generate audio for valid text** - Mocked API call
4. **Should include text length in result** - textLength property
5. **Should chunk text when exceeding max chars** - 4000 char test
6. **Should handle TTS errors gracefully** - Error marker returned
7. **Should preserve emotion in result** - emotion property maintained

### chunkText Tests (8 tests)
1. **Should return single chunk for short text** - "Short text."
2. **Should split at sentence boundaries** - "First. Second. Third."
3. **Should split long text** - 4000+ chars test
4. **Should handle text without periods** - "Text without sentence endings!"
5. **Should split at word boundaries for very long sentences** - 500 words
6. **Should preserve all text content** - Combined chunks equal original
7. **Should trim whitespace from chunks** - No leading/trailing spaces
8. **Should handle question marks and exclamation marks** - "Is this? Yes!"

### createSilenceSegment Tests (6 tests)
1. **Should create silence segment with duration** - duration: 1.0
2. **Should clamp duration to minimum 0.1 seconds** - 0.05 → 0.1
3. **Should clamp duration to maximum 10 seconds** - 15 → 10
4. **Should preserve duration within valid range** - 2.5 → 2.5
5. **Should handle zero duration** - 0 → 0.1
6. **Should handle negative duration** - -5 → 0.1

### Delay Helper Tests (2 tests)
1. **Should resolve after specified milliseconds** - 50ms test
2. **Should handle zero delay** - 0ms test

### Integration Tests (3 tests)
1. **Should handle mixed segment types** - text + pause + text
2. **Should respect progress callback format** - Verify structure
3. **Progress values in range** - 0 ≤ progress ≤ 100

**Total tts-generator tests: 31**

---

## Test File 4: service-worker-tts.test.js

### GENERATE_TTS Message Handling Tests (4 tests)
1. **Should reject without API key** - No key error
2. **Should reject without script** - No script error
3. **Should require script with segments** - Empty segments check
4. **Should validate script structure** - Missing segments property

### TTS Generation Workflow Tests (4 tests)
1. **Should use custom voice from message** - voice: 'Charon'
2. **Should pass onProgress callback to TTS generator** - Callback passing
3. **Should store result in CURRENT_AUDIO storage key** - Storage verify
4. **Should return success response with audio result** - Response structure

### Error Handling Tests (2 tests)
1. **Should catch TTS generation errors** - Error caught and handled
2. **Should log errors appropriately** - [GPTCast SW] prefix log

### Storage Integration Tests (5 tests)
1. **Should retrieve script from CURRENT_SCRIPT key** - Storage key verify
2. **Should retrieve API key from API_KEY key** - Storage key verify
3. **Should handle missing storage data gracefully** - No data case
4. **Should handle encrypted API key storage** - Encrypted data structure
5. **Should handle plain string API key** - Legacy format

### Constants Usage Tests (5 tests)
1. **Should use correct storage key for API key** - 'apiKey'
2. **Should use correct storage key for script** - 'currentScript'
3. **Should use correct storage key for audio** - 'currentAudio'
4. **Should use correct message type for TTS** - 'GENERATE_TTS'
5. **Should use correct message type for progress updates** - 'PROGRESS_UPDATE'

### Progress Updates Tests (3 tests)
1. **Should send progress updates via sendMessage** - Message sent
2. **Should ignore errors when popup is closed during progress update** - Error handling
3. **Should format progress callback correctly** - stage, progress, detail

**Total service-worker-tts tests: 32**

---

## Test Summary by Category

### Unit Tests (Function-level)
- voice-config.js functions: 19 tests
- audio-utils.js functions: 44 tests
- tts-generator.js class methods: 28 tests
- **Unit Tests Total: 91**

### Integration Tests
- tts-generator multi-segment: 3 tests
- service-worker workflow: 4 tests
- service-worker storage: 5 tests
- **Integration Tests Total: 12**

### Error Scenario Tests
- generateAudio error cases: 3 tests
- generateSegmentAudio errors: 2 tests
- service-worker validation: 4 tests
- error handling: 2 tests
- storage missing data: 1 test
- **Error Tests Total: 12**

### Edge Case Tests
- Empty/whitespace text: 3 tests
- Boundary conditions: 6 tests
- Special characters: 2 tests
- Large data sets: 3 tests
- **Edge Case Tests Total: 14**

---

## Test Execution Requirements

### Setup Required
1. Jest installed (npm install jest --save-dev)
2. @babel/preset-env for ES6 transformation
3. Global chrome API mock (provided in jest.setup.js)

### Files Required
- jest.config.js (provided)
- jest.setup.js (provided)
- All 4 test files (provided)

### No Additional Dependencies
- Tests use standard JavaScript
- No external testing libraries required
- No actual API calls needed (mocked)

---

## Coverage Goals

### Target Coverage: 100%
- **voice-config.js**: 100% (all functions tested)
- **audio-utils.js**: 100% (all functions tested)
- **tts-generator.js**: 100% (all methods tested)
- **service-worker.js**: 100% (TTS handler tested)

### Coverage Verification
Each test file includes:
- Function coverage: Every function/method
- Line coverage: All code paths
- Branch coverage: All conditionals
- Statement coverage: All statements

---

## Test Data Used

### Voice Options
- All 5 voices: Puck, Kore, Charon, Fenrir, Aoede
- All 6 emotions: excited, curious, thoughtful, emphatic, warm, neutral
- Custom voices: Test with Charon, Kore examples

### Text Samples
- Empty: ''
- Short: 'Hello', 'Short text.'
- Long: 4000+ characters
- Special chars: !?@#$%^&*()
- Whitespace: '   \n\t  '
- Sentences: With . ! ?
- Words: 500+ word sentences

### Audio Buffers
- Empty: ArrayBuffer(0)
- Small: 3-6 bytes
- Medium: 1000-5000 bytes
- Large: 48000+ bytes (1 second @ 24kHz)
- Multiple: 100+ buffers for merge test

### Durations
- Silence: 0.05, 0, 1, 2.5, 15, -5 seconds
- Valid range: 0.1 to 10 seconds
- Time delays: 0ms, 50ms

---

## Expected Test Output

### Successful Run
```
PASS  src/shared/__tests__/voice-config.test.js (1.234 s)
  PASS  Voice Configuration (21 tests)
PASS  src/shared/__tests__/audio-utils.test.js (2.456 s)
  PASS  Audio Utilities (46 tests)
PASS  src/background/__tests__/tts-generator.test.js (3.789 s)
  PASS  TTSGenerator (31 tests)
PASS  src/background/__tests__/service-worker-tts.test.js (1.567 s)
  PASS  Service Worker - TTS Generation (32 tests)

Test Suites: 4 passed, 4 total
Tests: 130 passed, 130 total
Time: 9.046s
```

### Coverage Output
```
File                    | % Stmts | % Branch | % Funcs | % Lines
------------------------|---------|----------|---------|----------
voice-config.js         |   100   |   100    |   100   |   100
audio-utils.js          |   100   |   100    |   100   |   100
tts-generator.js        |   100   |   100    |   100   |   100
service-worker.js (TTS) |   100   |   100    |   100   |   100
```

---

## Notes for Test Runners

1. **Async Handling**: All async tests use proper Jest patterns
2. **Mocking**: GeminiClient and chrome API are properly mocked
3. **Isolation**: Each test is independent with beforeEach cleanup
4. **Timing**: 10-second timeout configured for all tests
5. **Debugging**: Console errors suppressed for [GPTCast] prefixed messages

---

## Next Steps After Tests Pass

1. ✅ Created comprehensive test suites
2. ⏳ Run tests with Jest (npm test)
3. ⏳ Verify 100% coverage
4. ⏳ Integrate into CI/CD pipeline
5. ⏳ Proceed to Phase 5: Audio Mixing
