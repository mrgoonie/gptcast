/**
 * ChatGPT DOM selectors with fallback patterns
 * Multiple strategies to handle DOM structure changes
 */

export const SELECTORS = {
  // Primary selectors (most reliable as of Jan 2026)
  messageRoles: '[data-message-author-role]',
  messageId: '[data-message-id]',
  assistantContent: '.markdown',
  userContent: '.whitespace-pre-wrap',

  // Fallback selectors for changed DOM
  fallback: {
    messages: '[class*="agent-turn"], [class*="human-turn"]',
    userMessage: '[class*="user"], [class*="human"]',
    assistantMessage: '[class*="assistant"], [class*="agent"], [class*="gpt"]',
    turnContainer: '[data-testid="conversation-turn"]',
    messageContent: '[data-message-content]'
  },

  // Exclusions (elements to skip when extracting text)
  exclude: {
    codeToolbar: '.code-toolbar, [class*="code-toolbar"]',
    copyButton: '[class*="copy"], button[aria-label*="Copy"]',
    actionButtons: '[class*="action"], [class*="btn"]',
    metadata: '[class*="timestamp"], [class*="avatar"]'
  }
};

/**
 * Get the role of a message element
 * @param {Element} element - DOM element to check
 * @returns {string|null} - 'user', 'assistant', or null
 */
export function getMessageRole(element) {
  // Primary: data attribute
  const role = element.getAttribute('data-message-author-role');
  if (role) return role;

  // Fallback: class-based detection
  const classes = element.className || '';
  const classLower = classes.toLowerCase();

  if (classLower.includes('user') || classLower.includes('human')) {
    return 'user';
  }
  if (classLower.includes('assistant') || classLower.includes('agent') || classLower.includes('gpt')) {
    return 'assistant';
  }

  // Fallback: ancestor inspection
  const parent = element.closest('[data-message-author-role]');
  if (parent) {
    return parent.getAttribute('data-message-author-role');
  }

  return null;
}

/**
 * Check if element should be excluded from text extraction
 * @param {Element} element - Element to check
 * @returns {boolean}
 */
export function shouldExclude(element) {
  const excludeSelectors = Object.values(SELECTORS.exclude).join(', ');
  return element.matches(excludeSelectors) || element.closest(excludeSelectors);
}
