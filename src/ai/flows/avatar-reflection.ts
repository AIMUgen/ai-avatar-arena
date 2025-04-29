
'use server';
/**
 * @fileOverview Allows LLMs to use a 'think' action, generating a thought output, so that users can understand the LLM's reasoning and decision-making process.
 *
 * - avatarReflection - A function that allows the LLM to reflect and generate a thought.
 * - AvatarReflectionInput - The input type for the avatarReflection function.
 * - AvatarReflectionOutput - The return type for the avatarReflection function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

export const AvatarReflectionInputSchema = z.object({
  reflectionPrompt: z.string().describe('The prompt for the LLM to reflect on.'),
  // Add provider/model info if reflection needs specific model
  provider: z.string().describe('The LLM provider.'),
  model: z.string().describe('The LLM model.'),
  apiKey: z.string().optional().describe('API Key if needed.'),
});
export type AvatarReflectionInput = z.infer<typeof AvatarReflectionInputSchema>;

export const AvatarReflectionOutputSchema = z.object({
  thought: z.string().describe('The LLM generated thought.'),
});
export type AvatarReflectionOutput = z.infer<typeof AvatarReflectionOutputSchema>;


// --- Define the flow function (will be called by the exported wrapper) ---
let avatarReflectionFlowInternal: ((input: AvatarReflectionInput) => Promise<AvatarReflectionOutput>) | null = null;

if (!ai) {
    console.error("FATAL: 'ai' instance is not available in avatar-reflection.ts. Genkit may not be configured.");
    // Assign a function that throws if ai is not defined
    avatarReflectionFlowInternal = async (input: AvatarReflectionInput): Promise<AvatarReflectionOutput> => {
        throw new Error("'ai' instance is not available.");
    };
} else {
    // --- Define Prompt and Flow only if 'ai' is available ---
    console.log("SUCCESS: 'ai' instance is available in avatar-reflection.ts. Defining prompt and flow...");

    const prompt = ai.definePrompt({
      name: 'avatarReflectionPrompt',
      input: {
        schema: z.object({
          reflectionPrompt: z.string().describe('The prompt for the LLM to reflect on.'),
          // Include provider/model in input schema if needed for model selection
          provider: z.string(),
          model: z.string(),
          apiKey: z.string().optional(),
        }),
      },
      output: {
        schema: z.object({
          thought: z.string().describe('The LLM generated thought.'),
        }),
      },
      prompt: `Reflect on the following prompt and generate a thought:\n\n{{{reflectionPrompt}}}`,
       model: (input: z.infer<typeof AvatarReflectionInputSchema>) => {
            let modelName = input.model;
            if (input.provider === 'openrouter' && !modelName.startsWith('openrouter/')) {
                modelName = `openrouter/${modelName}`;
            } else if (input.provider === 'openai' && !modelName.startsWith('openai/')) {
                // modelName = `openai/${modelName}`; // Let plugin handle if possible
            } else if (input.provider === 'google' && !modelName.startsWith('google/')) {
                 // modelName = `google/${modelName}`; // Let plugin handle if possible
            }
            console.log(`Reflection using model: ${modelName}`);
            const selectedModel = ai.getModel(modelName);
             if (!selectedModel) {
                console.error(`Model ${modelName} not found for reflection! Falling back.`);
                const fallbackModel = ai.getModel('google/gemini-1.5-flash-latest') || ai.getModel('openai/gpt-3.5-turbo');
                if (!fallbackModel) throw new Error(`Model ${modelName} not found and no fallback available for reflection.`);
                return fallbackModel;
             }
             return selectedModel;
        },
       // config: (input) => ({ apiKey: input.apiKey }),
    });

    // Assign the actual flow function
    avatarReflectionFlowInternal = ai.defineFlow<
      typeof AvatarReflectionInputSchema,
      typeof AvatarReflectionOutputSchema
    >({
      name: 'avatarReflectionFlow',
      inputSchema: AvatarReflectionInputSchema,
      outputSchema: AvatarReflectionOutputSchema,
    }, async input => {
       let output: AvatarReflectionOutput | undefined;
        try {
             const response = await prompt(input);
             output = response.output;
        } catch (error: any) {
             console.error(`Reflection flow failed:`, error.message, error.stack);
              throw new Error(`LLM failed to generate a reflection: ${error.message}`);
        }

       if (!output) {
           console.error("Reflection flow failed to get output from prompt.");
           throw new Error("LLM failed to generate a reflection.");
         }
      return output;
    });
}

// Export the async wrapper function as required by "use server"
export async function avatarReflection(input: AvatarReflectionInput): Promise<AvatarReflectionOutput> {
   if (!avatarReflectionFlowInternal) {
       console.error("avatarReflectionFlowInternal is not initialized. 'ai' instance might be unavailable.");
       throw new Error("'ai' instance is not available or flow not initialized.");
   }
  // Call the flow function (which might be the error throwing one if ai is undefined)
  return avatarReflectionFlowInternal(input);
}
