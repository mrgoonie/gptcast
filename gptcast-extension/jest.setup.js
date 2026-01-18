/**
 * Jest setup file
 * Configure global mocks and test utilities
 */

// Mock chrome API globally
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn(),
    getContexts: jest.fn(() => Promise.resolve([]))
  },
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve())
    }
  },
  offscreen: {
    createDocument: jest.fn(() => Promise.resolve())
  }
};

// Mock crypto API
global.crypto = {
  subtle: {
    importKey: jest.fn(),
    decrypt: jest.fn()
  }
};

// Mock TextDecoder and TextEncoder if not available
if (!global.TextDecoder) {
  global.TextDecoder = class TextDecoder {
    decode(buffer) {
      return new String(buffer);
    }
  };
}

if (!global.TextEncoder) {
  global.TextEncoder = class TextEncoder {
    encode(string) {
      const buffer = new ArrayBuffer(string.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < string.length; i++) {
        view[i] = string.charCodeAt(i);
      }
      return view;
    }
  };
}

// Suppress console errors in tests unless explicitly needed
const originalError = console.error;
console.error = jest.fn((...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('[GPTCast]') || args[0].includes('Not implemented'))
  ) {
    // Suppress expected errors
    return;
  }
  originalError.call(console, ...args);
});

// Timeout for async operations
jest.setTimeout(10000);
