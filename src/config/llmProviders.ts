import type { LLMProvidersConfig } from '@/types';

// Note: Populate these with actual, up-to-date model IDs.
// OpenRouter free models might change, refer to their documentation.
export const llmProvidersConfig: LLMProvidersConfig = {
  google: {
    models: [
      'gemini-2.0-flash-lite', // Added per request
      'gemini-2.0-flash',     // Added per request
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest',
      'gemini-1.0-pro',
    ],
  },
  openai: {
    models: [
      'gpt-4o',
      'gpt-4o-mini',       // Added per request
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'openai/gpt-4.1-nano', // Added per request
    ],
  },
  openrouter: {
    // Keeping previous free models and adding new ones from request
    models: [
      'deepseek-chat-v3-0324:free', // Added per request
      'amazon/nova-pro-v1',         // Added per request
      'amazon/nova-micro-v1',        // Added per request
      'mistralai/mistral-7b-instruct', // Kept from previous config
      'huggingfaceh4/zephyr-7b-beta',   // Kept from previous config
      'google/gemma-7b-it',            // Kept from previous config
      'nousresearch/nous-hermes-2-mixtral-8x7b-dpo', // Kept from previous config
      'gryphe/mythomax-l2-13b',        // Kept from previous config
      // Add more OpenRouter models as needed, verifying free status
    ],
  },
};
