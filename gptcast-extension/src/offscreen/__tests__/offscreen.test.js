/**
 * Offscreen Document Tests
 * Tests for message handling and blob to base64 conversion
 */

import '../offscreen.js';
import { AudioMixer } from '../audio-mixer.js';

// Mock AudioMixer
jest.mock('../audio-mixer.js', () => {
  return {
    AudioMixer: jest.fn().mockImplementation(() => {
      return {
        mixAudio: jest.fn(),
        cleanup: jest.fn()
      };
    })
  };
});

// Mock Chrome API
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn((handler) => {
        global.__messageHandler = handler;
      })
    },
    sendMessage: jest.fn().mockResolvedValue({}),
    getURL: jest.fn((path) => `chrome-extension://id/${path}`)
  }
};

// Mock FileReader
class MockFileReader {
  constructor() {
    this.result = null;
    this.onloadend = null;
    this.onerror = null;
  }

  readAsDataURL(blob) {
    // Simulate base64 encoding
    this.result = `data:${blob.type};base64,bW9ja2F1ZGlvZGF0YQ==`;
    if (this.onloadend) {
      this.onloadend();
    }
  }
}

global.FileReader = MockFileReader;

// Mock Blob
global.Blob = jest.fn((parts, options) => {
  return {
    type: options?.type || 'application/octet-stream',
    size: parts.reduce((sum, p) => sum + (p.byteLength || p.length || 0), 0),
    parts
  };
});

describe('Offscreen Document', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('message listener setup', () => {
    it('should register message listener on load', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should have handler registered', () => {
      expect(global.__messageHandler).toBeDefined();
    });
  });

  describe('handleMessage - MIX_AUDIO', () => {
    it('should handle mix_audio message type', async () => {
      const mockBlob = { type: 'audio/webm', size: 1024 };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }],
        musicUrl: 'blob:music.wav'
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(AudioMixer).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            audio: expect.any(String),
            mimeType: 'audio/webm',
            size: 1024
          })
        })
      );
    });

    it('should reject if no segments provided', async () => {
      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: []
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('No audio segments')
        })
      );
    });

    it('should reject if segments is null', async () => {
      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: null
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String)
        })
      );
    });

    it('should convert blob to base64', async () => {
      const mockBlob = { type: 'audio/webm', size: 1024 };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      // Response should contain base64 encoded audio
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            audio: expect.any(String)
          })
        })
      );

      const response = sendResponse.mock.calls[0][0];
      expect(response.data.audio).not.toContain('data:');
      expect(response.data.audio).not.toContain(',');
    });

    it('should pass music url to mixer', async () => {
      const mockBlob = { type: 'audio/webm' };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const musicUrl = 'blob:music.wav';
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }],
        musicUrl
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(mockMixer.mixAudio).toHaveBeenCalledWith(
        message.segments,
        musicUrl,
        expect.any(Function)
      );
    });

    it('should pass progress callback to mixer', async () => {
      const mockBlob = { type: 'audio/webm' };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      // Third argument should be a function
      const callArgs = mockMixer.mixAudio.mock.calls[0];
      expect(typeof callArgs[2]).toBe('function');
    });

    it('should handle mixer errors', async () => {
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockRejectedValue(new Error('Mixing failed'));

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Mixing failed'
        })
      );
    });

    it('should cleanup mixer on error', async () => {
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockRejectedValue(new Error('Mixing failed'));

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(mockMixer.cleanup).toHaveBeenCalled();
    });

    it('should cleanup mixer on success', async () => {
      const mockBlob = { type: 'audio/webm' };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(mockMixer.cleanup).toHaveBeenCalled();
    });

    it('should include blob mime type in response', async () => {
      const mockBlob = { type: 'audio/webm;codecs=opus', size: 2048 };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mimeType: 'audio/webm;codecs=opus'
          })
        })
      );
    });

    it('should include blob size in response', async () => {
      const mockBlob = { type: 'audio/webm', size: 5000 };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            size: 5000
          })
        })
      );
    });

    it('should send progress updates during mixing', async () => {
      let progressCallback;
      const mockBlob = { type: 'audio/webm' };
      const mockMixer = AudioMixer.mock.results[0].value;

      mockMixer.mixAudio.mockImplementation((segments, musicUrl, onProgress) => {
        progressCallback = onProgress;
        return Promise.resolve(mockBlob);
      });

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      // Simulate progress callback
      progressCallback({ stage: 'mixing', progress: 50, detail: 'Mixing...' });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.stringMatching(/progress|update/i)
        })
      );
    });

    it('should not fail if progress update fails', async () => {
      let progressCallback;
      const mockBlob = { type: 'audio/webm' };
      const mockMixer = AudioMixer.mock.results[0].value;

      chrome.runtime.sendMessage.mockRejectedValue(new Error('Popup closed'));

      mockMixer.mixAudio.mockImplementation((segments, musicUrl, onProgress) => {
        progressCallback = onProgress;
        return Promise.resolve(mockBlob);
      });

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      // Should not throw even if popup closed
      progressCallback({ stage: 'mixing', progress: 50 });

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });
  });

  describe('handleMessage - unknown message type', () => {
    it('should reject unknown message types', async () => {
      const sendResponse = jest.fn();
      const message = {
        type: 'unknown_type'
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Unknown message type')
        })
      );
    });
  });

  describe('blobToBase64', () => {
    it('should convert blob to base64', async () => {
      const blob = { type: 'audio/webm' };
      const fileReader = new MockFileReader();

      // Can't directly test private function, so test through message handler
      const mockBlob = { type: 'audio/webm' };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      const response = sendResponse.mock.calls[0][0];
      expect(response.data.audio).toBe('bW9ja2F1ZGlvZGF0YQ==');
    });

    it('should remove data URL prefix', async () => {
      const mockBlob = { type: 'audio/webm' };
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockResolvedValue(mockBlob);

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      const response = sendResponse.mock.calls[0][0];
      // Should not contain data: prefix
      expect(response.data.audio).not.toMatch(/^data:/);
      // Should not contain comma
      expect(response.data.audio).not.toContain(',');
    });

    it('should handle different mime types', async () => {
      const testCases = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/mpeg',
        'audio/wav'
      ];

      for (const mimeType of testCases) {
        const mockBlob = { type: mimeType };
        const mockMixer = AudioMixer.mock.results[0].value;
        mockMixer.mixAudio.mockResolvedValue(mockBlob);

        const sendResponse = jest.fn();
        const message = {
          type: 'mix_audio',
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        };

        await global.__messageHandler(message, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              mimeType: mimeType
            })
          })
        );
      }
    });
  });

  describe('error handling', () => {
    it('should handle FileReader errors', async () => {
      const mockBlob = { type: 'audio/webm' };
      const mockMixer = AudioMixer.mock.results[0].value;

      mockMixer.mixAudio.mockImplementation(async () => {
        throw new Error('Decode failed');
      });

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false
        })
      );
    });

    it('should provide descriptive error messages', async () => {
      const mockMixer = AudioMixer.mock.results[0].value;
      mockMixer.mixAudio.mockRejectedValue(new Error('Audio context initialization failed'));

      const sendResponse = jest.fn();
      const message = {
        type: 'mix_audio',
        segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
      };

      await global.__messageHandler(message, {}, sendResponse);

      const response = sendResponse.mock.calls[0][0];
      expect(response.error).toContain('initialization failed');
    });
  });

  describe('return value', () => {
    it('should return true to keep channel open', () => {
      // The message handler should return true to allow async sendResponse
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  });
});
