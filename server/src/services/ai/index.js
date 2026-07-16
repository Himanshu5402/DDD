import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { MockAIProvider } from './mock.provider.js';
import { ClaudeAIProvider } from './claude.provider.js';
import { OpenAIProvider } from './openai.provider.js';

/**
 * AI provider factory. Selects from AI_PROVIDER and returns a shared instance.
 * Falls back to the mock provider if a real provider is selected but not
 * configured, so the app never hard-fails on a missing key in dev.
 */
let instance = null;

export function getAI() {
  if (instance) return instance;

  let provider;
  switch (env.AI_PROVIDER) {
    case 'claude':
      provider = new ClaudeAIProvider();
      break;
    case 'openai':
      provider = new OpenAIProvider();
      break;
    case 'mock':
    default:
      provider = new MockAIProvider();
      break;
  }

  if (!provider.isConfigured()) {
    logger.warn(`AI provider "${provider.name}" is not configured — falling back to mock provider.`);
    provider = new MockAIProvider();
  }

  instance = provider;
  logger.info(`AI provider: ${instance.name}`);
  return instance;
}
