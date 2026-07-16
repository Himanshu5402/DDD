import { AIProvider } from './ai.interface.js';
import env from '../../config/env.js';

/**
 * Anthropic Claude provider. The SDK is lazy-loaded (optional dependency), so
 * selecting it without the package/key installed fails clearly at call time
 * rather than crashing boot.
 */
export class ClaudeAIProvider extends AIProvider {
  #client = null;

  get name() {
    return 'claude';
  }

  isConfigured() {
    return Boolean(env.ANTHROPIC_API_KEY);
  }

  async #getClient() {
    if (this.#client) return this.#client;
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    let mod;
    try {
      mod = await import('@anthropic-ai/sdk');
    } catch {
      throw new Error("AI_PROVIDER=claude but '@anthropic-ai/sdk' is not installed. Run: npm i @anthropic-ai/sdk -w server");
    }
    const Anthropic = mod.default || mod.Anthropic;
    this.#client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return this.#client;
  }

  async complete({ system, messages = [], model, maxTokens = 1024, temperature = 0.7, tools } = {}) {
    const client = await this.#getClient();
    const res = await client.messages.create({
      model: model || env.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(tools ? { tools } : {}),
    });

    const text = (res.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return {
      text,
      model: res.model,
      provider: this.name,
      usage: { inputTokens: res.usage?.input_tokens, outputTokens: res.usage?.output_tokens },
      stopReason: res.stop_reason === 'end_turn' ? 'end' : res.stop_reason || 'unknown',
    };
  }
}
