'use server'; // Add this directive for server-only execution guarantees

import {
    ai as genkitAiCore, // Renamed to avoid conflict
    configureGenkit,
    GAuthPlugin,
    Plugin, // Generic Plugin type might be useful
    lookupSchema,
    lookupTool,
    renderPrompt,
    StatePlugin,
    promptRegistry,
} from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai'; // Specific import for googleAI plugin function
import { GenkitInstrumentation } from '@genkit-ai/instrumentation';
import { memoryStore } from '@genkit-ai/core'; // Correct location for memoryStore

// Ensure this file runs only on the server
if (typeof window !== 'undefined') {
    console.warn("ai-instance.ts should not run in the browser. 'ai' export will be undefined.");
}

console.log("Checking environment variables:");
console.log("NEXT_PUBLIC_GOOGLE_API_KEY:", !!process.env.NEXT_PUBLIC_GOOGLE_API_KEY ? 'Exists' : 'Missing');
console.log("NEXT_PUBLIC_OPENAI_API_KEY:", !!process.env.NEXT_PUBLIC_OPENAI_API_KEY ? 'Exists' : 'Missing');
console.log("NEXT_PUBLIC_OPENROUTER_API_KEY:", !!process.env.NEXT_PUBLIC_OPENROUTER_API_KEY ? 'Exists' : 'Missing');

console.log("Evaluating ai-instance.ts...");

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "YOUR_GOOGLE_API_KEY_PLACEHOLDER";
const OPENAI_API_KEY = process.env.NEXT_PUBLIC_OPENAI_API_KEY || "YOUR_OPENAI_API_KEY_PLACEHOLDER";
// Use dedicated OpenRouter key first, fall back to OpenAI key if specified, then placeholder
const OPENROUTER_API_KEY = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || OPENAI_API_KEY;

let isConfigured = false;
let aiInstance: any = undefined; // Use a separate variable for the instance

if (typeof window === 'undefined' && !isConfigured) {
    console.log("Attempting Genkit configuration in ai-instance.ts (Server)...");
    try {
        const pluginsToLoad: Plugin<any>[] = []; // Use the generic Plugin type

        // Google AI Plugin
        if (GOOGLE_API_KEY && GOOGLE_API_KEY !== "YOUR_GOOGLE_API_KEY_PLACEHOLDER") {
            if (!googleAI) {
                console.warn("googleAI plugin function is undefined, skipping Google configuration.");
            } else {
                console.log("Adding Google AI plugin...");
                pluginsToLoad.push(googleAI({ apiKey: GOOGLE_API_KEY }));
            }
        } else {
            console.warn("Google API Key missing or placeholder, skipping Google configuration.");
        }

        // OpenAI Plugin
        if (OPENAI_API_KEY && OPENAI_API_KEY !== "YOUR_OPENAI_API_KEY_PLACEHOLDER") {
            try {
                // Dynamically import inside the check
                const { openai } = await import('@genkit-ai/openai');
                if (openai) {
                    console.log("Adding OpenAI plugin...");
                    pluginsToLoad.push(openai({ apiKey: OPENAI_API_KEY }));
                } else {
                    console.warn("OpenAI plugin function failed to load, skipping OpenAI configuration.");
                }
            } catch (e) {
                console.warn("Failed to import @genkit-ai/openai. Please install it: npm install @genkit-ai/openai. Skipping OpenAI config.", e);
            }
        } else {
            console.warn("OpenAI API Key missing or placeholder, skipping OpenAI configuration.");
        }

        // OpenRouter Plugin (Uses OpenAI structure)
        // Ensure a valid OpenRouter key exists (and isn't just the OpenAI placeholder fallback)
        if (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== "YOUR_OPENAI_API_KEY_PLACEHOLDER" && OPENROUTER_API_KEY !== "YOUR_OPENROUTER_API_KEY_PLACEHOLDER") {
             try {
                const { openai } = await import('@genkit-ai/openai');
                 if (openai) {
                     console.log("Adding OpenRouter plugin (via OpenAI config)...");
                     pluginsToLoad.push(openai({
                         apiKey: OPENROUTER_API_KEY,
                         baseURL: 'https://openrouter.ai/api/v1',
                         // Define custom models for OpenRouter
                         // This tells Genkit that models like 'openrouter/deepseek-chat-v3-0324:free'
                         // should use this configured plugin instance.
                         customModels: [
                             { name: 'openrouter/deepseek-chat-v3-0324:free', type: 'generate' },
                             { name: 'openrouter/openai/gpt-4.1-nano', type: 'generate' },
                             { name: 'openrouter/amazon/nova-pro-v1', type: 'generate' },
                             { name: 'openrouter/amazon/nova-micro-v1', type: 'generate' },
                             // Add other OpenRouter models used in your config/types here
                             { name: 'openrouter/mistralai/mistral-7b-instruct', type: 'generate' },
                             { name: 'openrouter/huggingfaceh4/zephyr-7b-beta', type: 'generate' },
                             { name: 'openrouter/google/gemma-7b-it', type: 'generate' },
                             { name: 'openrouter/nousresearch/nous-hermes-2-mixtral-8x7b-dpo', type: 'generate' },
                             { name: 'openrouter/gryphe/mythomax-l2-13b', type: 'generate' },
                             { name: 'openrouter/openai/gpt-4o-mini', type: 'generate'}, // Add if using via OpenRouter
                             { name: 'openrouter/openai/gpt-4o', type: 'generate'}, // Add if using via OpenRouter
                         ],
                         // Define a model resolver function if needed to dynamically add 'openrouter/' prefix
                         modelResolver: (modelName) => {
                            if (modelName.startsWith('openrouter/')) {
                                // Already prefixed, return as is
                                return modelName;
                            }
                            // If a model from openrouter config is used *without* the prefix, add it here.
                            const openRouterModels = [
                                'deepseek-chat-v3-0324:free',
                                'openai/gpt-4.1-nano',
                                'amazon/nova-pro-v1',
                                'amazon/nova-micro-v1',
                                'mistralai/mistral-7b-instruct',
                                'huggingfaceh4/zephyr-7b-beta',
                                'google/gemma-7b-it',
                                'nousresearch/nous-hermes-2-mixtral-8x7b-dpo',
                                'gryphe/mythomax-l2-13b',
                                'openai/gpt-4o-mini',
                                'openai/gpt-4o',
                            ];
                             if (openRouterModels.includes(modelName)) {
                                return `openrouter/${modelName}`;
                            }
                            // Not an OpenRouter model known to this config
                            return modelName;
                         }
                     }));
                 } else {
                      console.warn("OpenAI plugin function failed to load for OpenRouter, skipping OpenRouter configuration.");
                 }
             } catch (e) {
                  console.warn("Failed to import @genkit-ai/openai for OpenRouter. Please install it: npm install @genkit-ai/openai. Skipping OpenRouter config.", e);
             }
         } else {
             console.warn("OpenRouter API Key missing or placeholder, skipping OpenRouter configuration.");
         }


        // Memory Store Plugin
        if (memoryStore) {
            console.log("Adding memoryStore plugin...");
            // Cast necessary as memoryStore returns a combined type.
             pluginsToLoad.push(memoryStore() as StatePlugin<any> & GenkitInstrumentation);
        } else {
            console.warn("memoryStore function is undefined, cannot add memory store plugin.");
        }


        if (pluginsToLoad.length > 0) {
            console.log(`Configuring Genkit with ${pluginsToLoad.length} plugins...`);
            configureGenkit({
                plugins: pluginsToLoad,
                logLevel: 'debug',
                enableTracingAndMetrics: true,
            });
            isConfigured = true;
            aiInstance = genkitAiCore; // Assign the core instance *after* successful configuration
            console.log("Genkit configured successfully in ai-instance.ts.");
        } else {
            console.error("FATAL: No valid Genkit plugins were loaded. 'ai' instance will be undefined.");
            isConfigured = true; // Mark as attempted, even if failed
            // aiInstance remains undefined
        }

    } catch (e: any) {
        console.error("Genkit configuration failed in ai-instance.ts:", e.message, e.stack);
        isConfigured = true; // Mark as attempted
        // aiInstance remains undefined
    }
} else if (typeof window === 'undefined') {
    console.log("Genkit configuration skipped (already attempted in this server process).");
    // Ensure aiInstance retains its value (either configured instance or undefined)
    aiInstance = genkitAiCore; // Assuming genkitAiCore should still be accessible if already configured? Or keep aiInstance?
    // Let's keep aiInstance as it was to avoid reassigning potentially undefined.
} else {
    // Browser environment
    // aiInstance remains undefined
}

// Export the potentially configured ai object (or undefined for browser/failed config).
export const ai = aiInstance;

// Log final export status
console.log(`ai object exported from ai-instance.ts. Is browser: ${typeof window !== 'undefined'}. Configured successfully: ${!!aiInstance}.`);

// Add a final check specifically for the server environment
if (typeof window === 'undefined' && !ai) {
    console.error("FINAL CHECK FAILED: 'ai' is undefined in ai-instance.ts before export on server!");
} else if (typeof window === 'undefined' && ai) {
    console.log("FINAL CHECK PASSED: 'ai' is defined in ai-instance.ts before export on server.");
}
