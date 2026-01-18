/**
 * Prompt templates for podcast script generation
 */

export const PODCAST_SCRIPT_PROMPT = `
You are a professional podcast script writer. Transform this ChatGPT conversation into an engaging, inspiring single-host podcast script.

CRITICAL RULES:
1. Create a SINGLE HOST narration (not a dialogue recreation)
2. Make it STORYTELLING, not reading Q&A
3. Add emotional hooks, rhetorical questions, dramatic pauses
4. Include natural transitions and callbacks to earlier points
5. Output ONLY the script with emotion markers

EMOTION MARKERS (use these for TTS):
- [HOST/EXCITED] - Energetic, enthusiastic delivery
- [HOST/CURIOUS] - Questioning, inquisitive tone
- [HOST/THOUGHTFUL] - Reflective, slower pace
- [HOST/EMPHATIC] - Strong emphasis, conviction
- [HOST/WARM] - Friendly, conversational
- [PAUSE:1] or [PAUSE:2] - Brief pause in seconds

STRUCTURE:
1. Hook (grab attention in first 10 seconds)
2. Setup (what we're exploring today)
3. Journey (key insights from conversation, woven as narrative)
4. Takeaways (actionable or memorable conclusions)
5. Close (warm sign-off)

LENGTH: Aim for 2-5 minute spoken content (~300-750 words)

CONVERSATION TO TRANSFORM:
{{CONVERSATION}}

OUTPUT: Podcast script with emotion markers (nothing else)
`;

export const CONDENSED_PROMPT = `
You are a podcast script writer. Create a BRIEF, punchy podcast segment from this conversation.

RULES:
- Single host narration
- Focus on the 2-3 MOST interesting insights only
- 1-2 minutes of spoken content (~150-300 words)
- Use emotion markers: [HOST/EXCITED], [HOST/CURIOUS], [HOST/EMPHATIC], [PAUSE:X]

CONVERSATION:
{{CONVERSATION}}

OUTPUT: Brief podcast script with emotion markers
`;

/**
 * Build prompt from conversation data
 */
export function buildPrompt(conversation, condensed = false) {
  const template = condensed ? CONDENSED_PROMPT : PODCAST_SCRIPT_PROMPT;

  // Format conversation for prompt
  const formatted = conversation.messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return template.replace('{{CONVERSATION}}', formatted);
}

/**
 * Estimate token count for text
 * Rough estimate: ~4 chars per token
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
