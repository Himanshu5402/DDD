import { AIProvider } from './ai.interface.js';
import env from '../../config/env.js';

/**
 * OpenAI provider. SDK lazy-loaded (optional dependency).
 */
export class OpenAIProvider extends AIProvider {
  #client = null;

  get name() {
    return 'openai';
  }

  isConfigured() {
    return Boolean(env.OPENAI_API_KEY);
  }

  async #getClient() {
    if (this.#client) return this.#client;
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    let mod;
    try {
      mod = await import('openai');
    } catch {
      throw new Error("AI_PROVIDER=openai but 'openai' is not installed. Run: npm i openai -w server");
    }
    const OpenAI = mod.default || mod.OpenAI;
    this.#client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    return this.#client;
  }

  async complete({ system, messages = [], model, maxTokens = 1024, temperature = 0.7 } = {}) {
    const client = await this.#getClient();
    const chatMessages = [];
    if (system) chatMessages.push({ role: 'system', content: system });
    for (const m of messages) chatMessages.push({ role: m.role, content: m.content });

    const res = await client.chat.completions.create({
      model: model || env.OPENAI_MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: chatMessages,
    });

    const choice = res.choices?.[0];
    return {
      text: choice?.message?.content ?? '',
      model: res.model,
      provider: this.name,
      usage: {
        inputTokens: res.usage?.prompt_tokens,
        outputTokens: res.usage?.completion_tokens,
      },
      stopReason: choice?.finish_reason === 'stop' ? 'end' : choice?.finish_reason || 'unknown',
    };
  }
}
