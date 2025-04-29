'use server';

/**
 * @fileOverview Processes the interaction between an avatar and an object, utilizing the object's custom note.
 *
 * - processObjectInteraction - A function that handles the object interaction process.
 * - ProcessObjectInteractionInput - The input type for the processObjectInteraction function.
 * - ProcessObjectInteractionOutput - The return type for the processObjectInteraction function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
// Removed getObjectDescription import - description is now passed directly

export const ProcessObjectInteractionInputSchema = z.object({
  objectId: z.string().describe('The ID of the object being interacted with.'),
  objectDescription: z.string().describe('The description/note of the object.'), // Pass description directly
  avatarSystemPrompt: z.string().describe('The system prompt for the avatar interacting with the object.'),
  // Add provider/model info
  provider: z.string().describe('The LLM provider.'),
  model: z.string().describe('The LLM model.'),
  apiKey: z.string().optional().describe('API Key if needed.'),
});
export type ProcessObjectInteractionInput = z.infer<typeof ProcessObjectInteractionInputSchema>;

export const ProcessObjectInteractionOutputSchema = z.object({
  reaction: z.string().describe('The avatar reaction (thought or short statement) to the object description.'),
});
export type ProcessObjectInteractionOutput = z.infer<typeof ProcessObjectInteractionOutputSchema>;


// --- Internal flow function, will be wrapped by the exported function ---
let processObjectInteractionFlowInternal: ((input: ProcessObjectInteractionInput) => Promise<ProcessObjectInteractionOutput>) | null = null;

// --- Check for 'ai' instance before defining anything ---
if (!ai) {
    console.error("FATAL: 'ai' instance is not available in process-object-interaction.ts. Genkit may not be configured.");
    // Define a dummy async function
    processObjectInteractionFlowInternal = async (input: ProcessObjectInteractionInput): Promise<ProcessObjectInteractionOutput> => {
        throw new Error("'ai' instance is not available.");
    };
} else {
    // --- Define Prompt and Flow only if 'ai' is available ---
    console.log("SUCCESS: 'ai' instance is available in process-object-interaction.ts. Defining prompt and flow...");

    const prompt = ai.definePrompt({
      name: 'processObjectInteractionPrompt',
      input: {
        schema: z.object({
          objectDescription: z.string().describe('The description of the object.'),
          avatarSystemPrompt: z.string().describe('The system prompt for the avatar interacting with the object.'),
          // Include provider/model in input schema
          provider: z.string(),
          model: z.string(),
          apiKey: z.string().optional(),
        }),
      },
      output: {
        schema: z.object({
          reaction: z.string().describe('Your brief reaction or thought about this object.'),
        }),
      },
      prompt: `{{avatarSystemPrompt}}\n\nYou are interacting with an object described as follows: "{{{objectDescription}}}".\n\nBriefly state your reaction or thought about this object.`,
       model: (input: z.infer<typeof ProcessObjectInteractionInputSchema>) => {
            let modelName = input.model;
            if (input.provider === 'openrouter' && !modelName.startsWith('openrouter/')) {
                modelName = `openrouter/${modelName}`;
            }
            console.log(`Object interaction using model: ${modelName}`);
            const selectedModel = ai.getModel(modelName);
             if (!selectedModel) {
                 console.error(`Model ${modelName} not found for object interaction! Falling back.`);
                const fallbackModel = ai.getModel('google/gemini-1.5-flash-latest') || ai.getModel('openai/gpt-3.5-turbo');
                if (!fallbackModel) throw new Error(`Model ${modelName} not found and no fallback available for object interaction.`);
                return fallbackModel;
             }
             return selectedModel;
        },
       // config: (input) => ({ apiKey: input.apiKey }),
    });

    processObjectInteractionFlowInternal = ai.defineFlow<
      typeof ProcessObjectInteractionInputSchema,
      typeof ProcessObjectInteractionOutputSchema
    >(
      {
        name: 'processObjectInteractionFlow',
        inputSchema: ProcessObjectInteractionInputSchema,
        outputSchema: ProcessObjectInteractionOutputSchema,
      },
      async input => {
         let output: ProcessObjectInteractionOutput | undefined;
         try {
             // Description is now part of the input, no need to fetch
             const response = await prompt({
                objectDescription: input.objectDescription,
                avatarSystemPrompt: input.avatarSystemPrompt,
                // Pass provider/model info to prompt
                provider: input.provider,
                model: input.model,
                apiKey: input.apiKey,
             });
             output = response.output;
         } catch (error: any) {
             console.error(`Object interaction flow failed for object ${input.objectId}:`, error.message, error.stack);
             throw new Error(`LLM failed to generate object interaction reaction: ${error.message}`);
         }

         if (!output) {
            console.error(`Object interaction flow failed to get output for object ${input.objectId}.`);
           throw new Error("LLM failed to generate an object interaction reaction.");
         }
        return output;
      }
    );

} // End of 'else' block

// Export the async wrapper function as required by "use server"
export async function processObjectInteraction(
  input: ProcessObjectInteractionInput
): Promise<ProcessObjectInteractionOutput> {
    if (!processObjectInteractionFlowInternal) {
        console.error("processObjectInteractionFlowInternal is not initialized. 'ai' instance might be unavailable.");
        throw new Error("'ai' instance is not available or flow not initialized.");
    }
     // Ensure provider and model are passed from the input object
     const flowInput = {
       ...input,
       provider: input.provider,
       model: input.model,
       apiKey: input.apiKey,
     };
  return processObjectInteractionFlowInternal(flowInput);
}
