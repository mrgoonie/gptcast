/**
 * Service Worker Audio Tests
 * Tests for MIX_AUDIO, GENERATE_PODCAST, DOWNLOAD_AUDIO, and audio utilities
 */

// Mock Chrome APIs before importing service-worker
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn((handler) => {
        global.__swMessageHandler = handler;
      })
    },
    sendMessage: jest.fn(),
    getURL: jest.fn((path) => `chrome-extension://id/${path}`),
    getContexts: jest.fn().mockResolvedValue([])
  },
  offscreen: {
    createDocument: jest.fn().mockResolvedValue(undefined)
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  downloads: {
    download: jest.fn().mockResolvedValue(1)
  }
};

// Mock modules before importing service-worker
jest.mock('../script-generator.js', () => ({
  ScriptGenerator: jest.fn()
}));
jest.mock('../tts-generator.js', () => ({
  TTSGenerator: jest.fn()
}));
jest.mock('../gemini-client.js', () => ({
  GeminiClient: jest.fn()
}));

import { MSG } from '../../shared/message-types.js';
import { STORAGE_KEYS } from '../../shared/constants.js';

// Import after mocks are set up
import '../service-worker.js';

describe('Service Worker - Audio Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });
  });

  describe('handleMixAudio', () => {
    it('should ensure offscreen document exists', async () => {
      const mockResponse = {
        success: true,
        data: { audio: 'base64audio', mimeType: 'audio/webm', size: 1024 }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO, musicMood: 'calm' };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.offscreen.createDocument).toHaveBeenCalled();
    });

    it('should reject if no audio segments available', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: null
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('audio segments')
        })
      );
    });

    it('should reject if audio result has no segments', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: { segments: [] }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false
        })
      );
    });

    it('should use default music mood if not provided', async () => {
      const mockResponse = {
        success: true,
        data: { audio: 'base64audio', mimeType: 'audio/webm' }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO }; // No musicMood

      await global.__swMessageHandler(message, {}, sendResponse);

      // Should use 'calm' as default
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          musicUrl: expect.stringContaining('calm.wav')
        })
      );
    });

    it('should pass music URL based on mood', async () => {
      const mockResponse = {
        success: true,
        data: { audio: 'base64audio', mimeType: 'audio/webm' }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO, musicMood: 'upbeat' };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          musicUrl: expect.stringContaining('upbeat.wav')
        })
      );
    });

    it('should pass segments to offscreen mixer', async () => {
      const segments = [
        { type: 'audio', audioData: 'dGVzdA==' },
        { type: 'silence', duration: 1.0 }
      ];

      const mockResponse = {
        success: true,
        data: { audio: 'base64audio', mimeType: 'audio/webm' }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: { segments }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MSG.MIX_AUDIO,
          segments
        })
      );
    });

    it('should forward response from offscreen mixer', async () => {
      const mockResponse = {
        success: true,
        data: { audio: 'base64audio', mimeType: 'audio/webm', size: 1024 }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle mixer errors', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Mixer failed'));
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Mixer failed')
        })
      );
    });

    it('should support ambient music mood', async () => {
      const mockResponse = {
        success: true,
        data: { audio: 'base64audio', mimeType: 'audio/webm' }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO, musicMood: 'ambient' };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          musicUrl: expect.stringContaining('ambient.wav')
        })
      );
    });

    it('should support no music (none mood)', async () => {
      const mockResponse = {
        success: true,
        data: { audio: 'base64audio', mimeType: 'audio/webm' }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO, musicMood: 'none' };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          musicUrl: null
        })
      );
    });
  });

  describe('handleGeneratePodcast', () => {
    it('should mix audio and download', async () => {
      const mixResponse = {
        success: true,
        data: {
          audio: 'YWJjZGVmZ2g=',
          mimeType: 'audio/webm',
          size: 2048
        }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mixResponse);
      chrome.storage.local.get.mockImplementation((keys) => {
        if (keys.includes(STORAGE_KEYS.CURRENT_AUDIO)) {
          return Promise.resolve({
            [STORAGE_KEYS.CURRENT_AUDIO]: {
              segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
            }
          });
        }
        if (keys.includes(STORAGE_KEYS.CURRENT_CONVERSATION)) {
          return Promise.resolve({
            [STORAGE_KEYS.CURRENT_CONVERSATION]: {
              title: 'Test Podcast'
            }
          });
        }
        return Promise.resolve({});
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.GENERATE_PODCAST };

      await global.__swMessageHandler(message, {}, sendResponse);

      // Should call mix
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MSG.MIX_AUDIO
        })
      );

      // Should call download
      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should reject if no audio segments', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: null
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.GENERATE_PODCAST };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('audio segments')
        })
      );
    });

    it('should send progress updates', async () => {
      const mixResponse = {
        success: true,
        data: {
          audio: 'YWJjZGVmZ2g=',
          mimeType: 'audio/webm'
        }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mixResponse);
      chrome.storage.local.get.mockImplementation((keys) => {
        if (keys.includes(STORAGE_KEYS.CURRENT_AUDIO)) {
          return Promise.resolve({
            [STORAGE_KEYS.CURRENT_AUDIO]: {
              segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
            }
          });
        }
        if (keys.includes(STORAGE_KEYS.CURRENT_CONVERSATION)) {
          return Promise.resolve({
            [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Test' }
          });
        }
        return Promise.resolve({});
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.GENERATE_PODCAST };

      await global.__swMessageHandler(message, {}, sendResponse);

      // Should send progress for mixing and exporting
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MSG.PROGRESS_UPDATE,
          stage: 'mixing'
        })
      );
    });

    it('should handle mix failures gracefully', async () => {
      const mixResponse = {
        success: false,
        error: 'Mixing failed'
      };

      chrome.runtime.sendMessage.mockResolvedValue(mixResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.GENERATE_PODCAST };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(mixResponse);
      expect(chrome.downloads.download).not.toHaveBeenCalled();
    });

    it('should use conversation title in filename', async () => {
      const mixResponse = {
        success: true,
        data: {
          audio: 'YWJjZGVmZ2g=',
          mimeType: 'audio/webm'
        }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mixResponse);
      chrome.storage.local.get.mockImplementation((keys) => {
        if (keys.includes(STORAGE_KEYS.CURRENT_AUDIO)) {
          return Promise.resolve({
            [STORAGE_KEYS.CURRENT_AUDIO]: {
              segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
            }
          });
        }
        if (keys.includes(STORAGE_KEYS.CURRENT_CONVERSATION)) {
          return Promise.resolve({
            [STORAGE_KEYS.CURRENT_CONVERSATION]: {
              title: 'My Amazing Podcast'
            }
          });
        }
        return Promise.resolve({});
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.GENERATE_PODCAST };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringContaining('my-amazing-podcast')
        })
      );
    });
  });

  describe('handleDownloadAudio', () => {
    it('should trigger download with audio data', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Podcast' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'YWJjZGVmZ2g=',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });

    it('should reject if no audio data provided', async () => {
      const sendResponse = jest.fn();
      const message = { type: MSG.DOWNLOAD_AUDIO, data: {} };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('No audio data')
        })
      );
    });

    it('should reject if data is null', async () => {
      const sendResponse = jest.fn();
      const message = { type: MSG.DOWNLOAD_AUDIO, data: null };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false
        })
      );
    });

    it('should create data URL from base64 audio', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Test' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdGF1ZGlv', // 'testaudio' in base64
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringMatching(/^data:audio\/webm;base64,/)
        })
      );
    });

    it('should handle download errors', async () => {
      chrome.downloads.download.mockRejectedValue(new Error('Download failed'));
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Test' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Download failed')
        })
      );
    });
  });

  describe('triggerDownload', () => {
    it('should create data URL from base64', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Podcast' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringMatching(/^data:audio\/webm;base64,/)
        })
      );
    });

    it('should include timestamp in filename', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Podcast' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringMatching(/\d{4}-\d{2}-\d{2}/)
        })
      );
    });

    it('should determine extension based on mime type', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Podcast' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/mpeg'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringMatching(/\.mp3$/)
        })
      );
    });

    it('should use webm extension for webm mime type', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Podcast' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringMatching(/\.webm$/)
        })
      );
    });

    it('should set saveAs to true for user confirmation', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'Podcast' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          saveAs: true
        })
      );
    });
  });

  describe('sanitizeFilename', () => {
    it('should convert to lowercase through filename', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'MY PODCAST' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringMatching(/my-podcast/)
        })
      );
    });

    it('should replace special characters with dashes', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: 'My@Podcast#2024!' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      const filename = chrome.downloads.download.mock.calls[0][0].filename;
      expect(filename).toMatch(/my-podcast-2024/);
    });

    it('should remove leading and trailing dashes', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: '---Podcast---' }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      const filename = chrome.downloads.download.mock.calls[0][0].filename;
      expect(filename).not.toMatch(/^-|-$/);
    });

    it('should limit filename length', async () => {
      const longTitle = 'a'.repeat(100);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: { title: longTitle }
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      const filename = chrome.downloads.download.mock.calls[0][0].filename;
      expect(filename.length).toBeLessThan(100);
    });

    it('should handle missing conversation title', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_CONVERSATION]: null
      });

      const sendResponse = jest.fn();
      const message = {
        type: MSG.DOWNLOAD_AUDIO,
        data: {
          audio: 'dGVzdA==',
          mimeType: 'audio/webm'
        }
      };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringMatching(/podcast/)
        })
      );
    });
  });

  describe('getMusicUrl', () => {
    it('should return calm music URL by default', async () => {
      const mockResponse = {
        success: true,
        data: {
          audio: 'YWJjZGVmZ2g=',
          mimeType: 'audio/webm'
        }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          musicUrl: expect.stringContaining('calm.wav')
        })
      );
    });

    it('should return null for none mood', async () => {
      const mockResponse = {
        success: true,
        data: {
          audio: 'YWJjZGVmZ2g=',
          mimeType: 'audio/webm'
        }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO, musicMood: 'none' };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          musicUrl: null
        })
      );
    });

    it('should use getURL for music file paths', async () => {
      const mockResponse = {
        success: true,
        data: {
          audio: 'YWJjZGVmZ2g=',
          mimeType: 'audio/webm'
        }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO, musicMood: 'upbeat' };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(chrome.runtime.getURL).toHaveBeenCalledWith('assets/music/upbeat.wav');
    });
  });

  describe('offscreen document management', () => {
    it('should not recreate offscreen document if already exists', async () => {
      // Set offscreenDocumentCreated to true
      chrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      const mockResponse = {
        success: true,
        data: { audio: 'base64', mimeType: 'audio/webm' }
      };

      chrome.runtime.sendMessage.mockResolvedValue(mockResponse);
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO };

      // Call twice
      await global.__swMessageHandler(message, {}, sendResponse);
      await global.__swMessageHandler(message, {}, sendResponse);

      // Should only create once per fresh test
      expect(chrome.offscreen.createDocument).toHaveBeenCalled();
    });

    it('should handle offscreen creation errors gracefully', async () => {
      chrome.offscreen.createDocument.mockRejectedValue(new Error('Offscreen creation failed'));
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.CURRENT_AUDIO]: {
          segments: [{ type: 'audio', audioData: 'dGVzdA==' }]
        }
      });

      const sendResponse = jest.fn();
      const message = { type: MSG.MIX_AUDIO };

      await global.__swMessageHandler(message, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false
        })
      );
    });
  });
});
