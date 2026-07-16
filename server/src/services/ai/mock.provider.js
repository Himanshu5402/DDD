import { AIProvider } from './ai.interface.js';

/**
 * Zero-dependency AI provider for local dev, tests, and demos. It produces a
 * deterministic, clearly-labelled placeholder response so AI-powered endpoints
 * work end-to-end without any API key. Swap AI_PROVIDER=claude|openai for real
 * completions.
 */
export class MockAIProvider extends AIProvider {
  get name() {
    return 'mock';
  }

  async complete({ system, messages = [], model = 'mock-1' } = {}) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content ?? '';
    const preview = prompt.slice(0, 280);
    const text =
      `【mock AI】 This is a placeholder completion (no live model configured).\n` +
      (system ? `Context: ${system.slice(0, 120)}\n` : '') +
      `You asked: "${preview}"`;

    return {
      text,
      model,
      provider: this.name,
      usage: { inputTokens: prompt.length, outputTokens: text.length },
      stopReason: 'end',
    };
  }
}
