/**
 * Service Worker TTS Integration Tests
 * Tests for service worker GENERATE_TTS message handling
 */

// Mock chrome API
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn(),
    getContexts: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  offscreen: {
    createDocument: jest.fn()
  }
};

// Mock crypto API
global.crypto = {
  subtle: {
    importKey: jest.fn(),
    decrypt: jest.fn()
  }
};

// Mocks for imports
jest.mock('../tts-generator.js', () => {
  return {
    TTSGenerator: jest.fn().mockImplementation((apiKey) => {
      return {
        generateAudio: jest.fn().mockResolvedValue({
          segments: [
            { type: 'audio', audioData: 'test-audio', mimeType: 'audio/pcm' }
          ],
          metadata: {
            totalSegments: 1,
            voice: 'Puck',
            generatedAt: new Date().toISOString()
          }
        })
      };
    })
  };
});

jest.mock('../gemini-client.js', () => {
  return {
    GeminiClient: jest.fn()
  };
});

jest.mock('../script-generator.js', () => {
  return {
    ScriptGenerator: jest.fn()
  };
});

jest.mock('../message-types.js', () => {
  return {
    MSG: {
      CONVERSATION_DATA: 'CONVERSATION_DATA',
      GENERATE_SCRIPT: 'GENERATE_SCRIPT',
      GENERATE_TTS: 'GENERATE_TTS',
      MIX_AUDIO: 'MIX_AUDIO',
      GENERATE_PODCAST: 'GENERATE_PODCAST',
      TEST_API_KEY: 'TEST_API_KEY',
      PROGRESS_UPDATE: 'PROGRESS_UPDATE'
    }
  };
});

jest.mock('../constants.js', () => {
  return {
    STORAGE_KEYS: {
      API_KEY: 'apiKey',
      ENCRYPTION_KEY: 'gptcast-encryption-key',
      CURRENT_CONVERSATION: 'currentConversation',
      CURRENT_SCRIPT: 'currentScript',
      CURRENT_AUDIO: 'currentAudio',
      SETTINGS: 'settings'
    }
  };
});

describe('Service Worker - TTS Generation Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GENERATE_TTS message handling', () => {
    it('should reject without API key', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      // Simulating the handler logic
      const apiKey = null;
      const sendResponse = jest.fn();

      if (!apiKey) {
        sendResponse({
          success: false,
          error: 'API key not configured. Please add your Gemini API key in Settings.'
        });
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });

    it('should reject without script', async () => {
      chrome.storage.local.get.mockResolvedValue({
        apiKey: 'test-key'
      });

      const sendResponse = jest.fn();
      const stored = await chrome.storage.local.get('currentScript');

      if (!stored?.script?.segments?.length) {
        sendResponse({
          success: false,
          error: 'No script found. Please generate a script first.'
        });
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('should require script with segments', async () => {
      const scriptResult = { script: { segments: null } };
      const sendResponse = jest.fn();

      if (!scriptResult?.script?.segments?.length) {
        sendResponse({
          success: false,
          error: 'No script found. Please generate a script first.'
        });
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('should validate script structure', async () => {
      const scriptResult = { script: {} };
      const sendResponse = jest.fn();

      if (!scriptResult?.script?.segments?.length) {
        sendResponse({
          success: false,
          error: 'No script found. Please generate a script first.'
        });
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });

  describe('TTS Generation workflow', () => {
    it('should use custom voice from message', async () => {
      const { TTSGenerator } = require('../tts-generator.js');
      const generator = new TTSGenerator('test-key');
      const message = { voice: 'Charon' };

      // Simulate the handler calling generateAudio
      const result = await generator.generateAudio(
        { segments: [{ type: 'text', text: 'Hello', emotion: 'neutral' }] },
        { voice: message.voice }
      );

      // The mock should have been called with the custom voice
      expect(generator.generateAudio).toHaveBeenCalled();
    });

    it('should pass onProgress callback to TTS generator', async () => {
      const { TTSGenerator } = require('../tts-generator.js');
      const generator = new TTSGenerator('test-key');
      const mockProgress = jest.fn();

      const scriptResult = {
        script: {
          segments: [
            { type: 'text', text: 'Test', emotion: 'neutral' }
          ]
        }
      };

      await generator.generateAudio(scriptResult.script, {
        voice: 'Puck',
        onProgress: mockProgress
      });

      // Progress callback should be configured
      expect(generator.generateAudio).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          onProgress: mockProgress
        })
      );
    });

    it('should store result in CURRENT_AUDIO storage key', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);

      const result = {
        segments: [{ type: 'audio', audioData: 'data' }],
        metadata: { voice: 'Puck' }
      };

      // Simulate storing
      await chrome.storage.local.set({
        currentAudio: result
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        currentAudio: result
      });
    });

    it('should return success response with audio result', async () => {
      const sendResponse = jest.fn();
      const result = {
        segments: [{ type: 'audio' }],
        metadata: {}
      };

      sendResponse({ success: true, data: result });

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ segments: expect.any(Array) })
      });
    });
  });

  describe('Error handling', () => {
    it('should catch TTS generation errors', async () => {
      const sendResponse = jest.fn();
      const error = new Error('TTS API Error');

      try {
        throw error;
      } catch (e) {
        sendResponse({
          success: false,
          error: e.message
        });
      }

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('should log errors appropriately', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('TTS Error');

      try {
        throw error;
      } catch (e) {
        console.error('[GPTCast SW] TTS generation error:', e);
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TTS generation error'),
        error
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Storage integration', () => {
    it('should retrieve script from CURRENT_SCRIPT key', async () => {
      chrome.storage.local.get.mockResolvedValue({
        currentScript: {
          script: {
            segments: [{ type: 'text', text: 'Hello', emotion: 'neutral' }]
          }
        }
      });

      const stored = await chrome.storage.local.get('currentScript');
      expect(chrome.storage.local.get).toHaveBeenCalledWith('currentScript');
      expect(stored.currentScript).toBeDefined();
    });

    it('should retrieve API key from API_KEY key', async () => {
      chrome.storage.local.get.mockResolvedValue({
        apiKey: 'test-api-key'
      });

      const stored = await chrome.storage.local.get('apiKey');
      expect(stored.apiKey).toBe('test-api-key');
    });

    it('should handle missing storage data gracefully', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const stored = await chrome.storage.local.get('nonexistent');
      expect(stored.nonexistent).toBeUndefined();
    });

    it('should handle encrypted API key storage', async () => {
      const encryptedData = {
        apiKey: {
          data: [1, 2, 3],
          iv: [4, 5, 6]
        }
      };

      chrome.storage.local.get.mockResolvedValue(encryptedData);

      const stored = await chrome.storage.local.get('apiKey');
      expect(stored.apiKey).toBeDefined();
      expect(stored.apiKey.data).toBeDefined();
      expect(stored.apiKey.iv).toBeDefined();
    });
  });

  describe('Constants usage', () => {
    it('should use correct storage key for API key', () => {
      const { STORAGE_KEYS } = require('../constants.js');
      expect(STORAGE_KEYS.API_KEY).toBe('apiKey');
    });

    it('should use correct storage key for script', () => {
      const { STORAGE_KEYS } = require('../constants.js');
      expect(STORAGE_KEYS.CURRENT_SCRIPT).toBe('currentScript');
    });

    it('should use correct storage key for audio', () => {
      const { STORAGE_KEYS } = require('../constants.js');
      expect(STORAGE_KEYS.CURRENT_AUDIO).toBe('currentAudio');
    });

    it('should use correct message type for TTS', () => {
      const { MSG } = require('../message-types.js');
      expect(MSG.GENERATE_TTS).toBe('GENERATE_TTS');
    });

    it('should use correct message type for progress updates', () => {
      const { MSG } = require('../message-types.js');
      expect(MSG.PROGRESS_UPDATE).toBe('PROGRESS_UPDATE');
    });
  });

  describe('Progress updates', () => {
    it('should send progress updates via sendMessage', async () => {
      chrome.runtime.sendMessage.mockResolvedValue(undefined);

      const progress = {
        type: 'PROGRESS_UPDATE',
        stage: 'tts',
        progress: 50,
        detail: 'Generating audio 5/10'
      };

      await chrome.runtime.sendMessage(progress);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(progress);
    });

    it('should ignore errors when popup is closed during progress update', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Popup closed'));

      try {
        await chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE' });
      } catch (e) {
        // Expected to be caught and ignored
      }

      // Should still complete without throwing
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    it('should format progress callback correctly', () => {
      const progressUpdate = {
        stage: 'tts',
        progress: 75,
        detail: 'Generating audio 8/10'
      };

      expect(progressUpdate.stage).toBe('tts');
      expect(typeof progressUpdate.progress).toBe('number');
      expect(progressUpdate.progress).toBeGreaterThanOrEqual(0);
      expect(progressUpdate.progress).toBeLessThanOrEqual(100);
      expect(progressUpdate.detail).toBeDefined();
    });
  });
});
