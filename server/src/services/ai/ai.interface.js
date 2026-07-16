/**
 * AI provider contract. Providers (Claude, OpenAI, Gemini, Ollama…) implement
 * this so the AI Intelligence Layer and any module copilot can stay
 * vendor-neutral. Designed to be MCP-ready: `tools` can carry MCP tool specs.
 *
 * @typedef {{ role: 'user'|'assistant', content: string }} ChatMessage
 * @typedef {Object} CompletionResult
 * @property {string} text
 * @property {string} model
 * @property {string} provider
 * @property {{ inputTokens?: number, outputTokens?: number }} [usage]
 * @property {'end'|'length'|'tool_use'|'unknown'} [stopReason]
 */

export class AIProvider {
  /** @returns {string} provider name */
  get name() {
    throw new Error('not implemented');
  }

  /** @returns {boolean} whether the provider is configured & ready */
  isConfigured() {
    return true;
  }

  /**
   * @param {Object} params
   * @param {string} [params.system]      System / instruction prompt
   * @param {ChatMessage[]} params.messages
   * @param {string} [params.model]
   * @param {number} [params.maxTokens]
   * @param {number} [params.temperature]
   * @param {Array}  [params.tools]       Optional tool/MCP specs
   * @returns {Promise<CompletionResult>}
   */
  async complete(_params) {
    throw new Error('not implemented');
  }

  /** Convenience: single-prompt completion. */
  async ask(prompt, { system, ...rest } = {}) {
    return this.complete({ system, messages: [{ role: 'user', content: prompt }], ...rest });
  }
}
