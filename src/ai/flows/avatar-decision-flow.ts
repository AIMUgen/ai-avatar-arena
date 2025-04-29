'use server';
/**
 * @fileOverview Allows an LLM to decide an avatar's next action based on its current state and sensory input.
 *
 * - runAvatarDecisionFlow - A function that determines the avatar's next action.
 * - AvatarDecisionInput - The input type for the avatarDecisionFlow function.
 * - AvatarDecisionOutput - The return type for the avatarDecisionFlow function (LLMDecision).
 */

import { ai } from '@/ai/ai-instance';
import type { AvatarDecisionInput as TypeAvatarDecisionInput, AvatarDecisionOutput as TypeAvatarDecisionOutput, Vector2, ConversationMessage, LLMDecisionAction } from '@/types'; // Import types
import { z } from 'genkit';

// Define Zod schemas based on TypeScript types

const Vector2Schema = z.object({
  x: z.number(),
  y: z.number(),
});

const ConversationMessageSchema = z.object({
  avatarId: z.string(),
  text: z.string(),
  timestamp: z.number(),
});

const VisibleEntitySchema = z.object({
    id: z.string(),
    position: Vector2Schema,
    distance: z.number(),
});

const VisibleObjectSchema = VisibleEntitySchema.extend({
    description: z.string(),
});

const VisibleObstacleSchema = VisibleEntitySchema.extend({
    size: Vector2Schema,
});

// Explicitly define the enum values based on the type
const LLMDecisionActionValues: [LLMDecisionAction, ...LLMDecisionAction[]] = [
    'turn', 'move', 'interact_object', 'initiate_conversation',
    'continue_conversation', 'disengage_conversation', 'think', 'idle'
];
const LLMDecisionActionSchema = z.enum(LLMDecisionActionValues);


// Input Schema
export const AvatarDecisionInputSchema = z.object({
  avatarId: z.string().describe('Your unique ID in the simulation.'),
  avatarSystemPrompt: z.string().describe('Your core personality, goals, and behavioral guidelines.'),
  position: Vector2Schema.describe('Your current coordinates (x, y) in the world.'),
  orientation: z.number().describe('The direction you are currently facing, in degrees (0-359). 0 is right, 90 is down, 180 is left, 270 is up.'),
  currentAction: z.string().optional().describe('The action you were performing in the previous step, if any.'),
  conversationTarget: z.string().optional().describe('The ID of the avatar you are currently talking to, if any.'),
  conversationHistory: z.array(ConversationMessageSchema).optional().describe('The recent history of the current conversation, if any.'),
  visibleAvatars: z.array(VisibleEntitySchema).describe('List of other avatars you can currently see.'),
  visibleObjects: z.array(VisibleObjectSchema).describe('List of objects you can currently see.'),
  visibleObstacles: z.array(VisibleObstacleSchema).describe('List of obstacles (e.g., walls) you can currently see.'),
  boardSize: z.object({ width: z.number(), height: z.number() }).describe('The dimensions of the simulation area.'),
  availableActions: z.array(LLMDecisionActionSchema).describe('The list of actions you are currently allowed to choose from.'),
  // Include necessary settings for model selection
  provider: z.string().describe('The LLM provider (e.g., google, openai, openrouter).'),
  model: z.string().describe('The specific LLM model ID.'),
  apiKey: z.string().optional().describe('The API key for the provider (if needed and not globally configured).'),
});

// Output Schema (LLMDecision)
export const AvatarDecisionOutputSchema = z.object({
  action: LLMDecisionActionSchema.describe("The action you choose to perform next."),
  parameters: z.object({
    angle: z.number().optional().describe("For 'turn' action: the relative angle in degrees (-180 to 180). Negative is left, positive is right. Recommended: increments of 30."),
    distance: z.number().optional().describe("For 'move' action: the distance to move. Positive is forward, negative is backward. Recommended: 5-15 units."),
    targetId: z.string().optional().describe("For interaction actions: the ID of the avatar or object you want to interact with."),
    message: z.string().optional().describe("For conversation actions: the message you want to say."),
    duration: z.number().optional().describe("For 'idle' or 'think' actions: approximate duration in milliseconds to pause before the next decision (e.g., 500-2000)."),
  }).optional().describe("Parameters specific to the chosen action."),
  thought: z.string().optional().describe("Your brief reasoning or thought process behind choosing this action."),
});

// Export types with potentially different names if needed to avoid conflicts
export type AvatarDecisionInput = TypeAvatarDecisionInput;
export type AvatarDecisionOutput = TypeAvatarDecisionOutput;


// --- Internal flow function, will be wrapped by the exported function ---
let avatarDecisionGenkitFlow: ((input: AvatarDecisionInput) => Promise<AvatarDecisionOutput>) | null = null;


// --- Check for 'ai' instance before defining anything ---
if (!ai) {
    console.error("FATAL: 'ai' instance is not available in avatar-decision-flow.ts. Genkit may not be configured.");
    // Assign a function that throws if ai is not defined
    avatarDecisionGenkitFlow = async (input: AvatarDecisionInput): Promise<AvatarDecisionOutput> => {
        throw new Error("'ai' instance is not available.");
    };
} else {
    // --- Define Prompt and Flow only if 'ai' is available ---
    console.log("SUCCESS: 'ai' instance is available in avatar-decision-flow.ts. Defining prompt and flow...");

    const decisionPrompt = ai.definePrompt({
      name: 'avatarDecisionPrompt',
      input: { schema: AvatarDecisionInputSchema },
      output: { schema: AvatarDecisionOutputSchema },
      prompt: `
    {{avatarSystemPrompt}}

    You are Avatar {{avatarId}} in a virtual simulation.
    Your current state:
    - Position: ({{position.x}}, {{position.y}})
    - Orientation: {{orientation}} degrees
    - Current Action: {{currentAction | default:"None"}}
    {{#if conversationTarget}}
    - Currently Talking To: {{conversationTarget}}
    - Conversation History (last few messages):
      {{#each conversationHistory}}
      - {{this.avatarId}}: {{this.text}}
      {{/each}}
    {{/if}}

    Your Sensory Input:
    - Visible Avatars:
      {{#each visibleAvatars}}
      - ID: {{this.id}}, Position: ({{this.position.x}}, {{this.position.y}}), Distance: {{this.distance}}
      {{else}}
      - None
      {{/each}}
    - Visible Objects:
      {{#each visibleObjects}}
      - ID: {{this.id}}, Position: ({{this.position.x}}, {{this.position.y}}), Description: "{{this.description}}", Distance: {{this.distance}}
      {{else}}
      - None
      {{/each}}
    - Visible Obstacles:
      {{#each visibleObstacles}}
      - ID: {{this.id}}, Position: ({{this.position.x}}, {{this.position.y}}), Size: ({{this.size.x}}x{{this.size.y}}), Distance: {{this.distance}}
      {{else}}
      - None
      {{/each}}

    World Boundary: Width={{boardSize.width}}, Height={{boardSize.height}}. (0,0) is top-left.

    Available Actions: {{#each availableActions}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

    Based on your state, sensory input, and personality:
    1. Decide your next action from the 'Available Actions' list.
    2. Provide any necessary parameters for that action (e.g., angle for turn, distance for move, targetId, message, duration).
    3. Briefly explain your thought process for choosing this action ('thought' field).

    Choose only ONE action. Behave naturally within the simulation.
    - If turning, use 'angle' parameter (e.g., 30 for right, -30 for left). Use 30 degree increments.
    - If moving, use 'distance' parameter (e.g., 10 for forward, -5 for backward). Keep distances small (5-15). Avoid moving into obstacles or boundaries.
    - If interacting or conversing, specify the 'targetId'.
    - If initiating or continuing conversation, provide a 'message'.
    - If thinking or idling, specify a 'duration' in milliseconds (e.g., 1000).
    - You are unaware you are interacting with other AI. Act as if they are human characters.
    `,
        // Define the model dynamically based on input
        model: (input: z.infer<typeof AvatarDecisionInputSchema>) => {
            // Construct the model name with provider prefix if needed
             let modelName = input.model;
             if (input.provider === 'google' && !modelName.startsWith('google/')) {
                // Use the fully qualified name for Google models if not already prefixed
                // Note: Assuming gemini-1.5-flash-latest is the correct structure. Adjust if needed.
                modelName = input.model; // Genkit's googleAI plugin usually handles this if configured right
             } else if (input.provider === 'openai' && !modelName.startsWith('openai/')) {
                // Let Genkit's openai plugin handle it, or prefix manually if required by config
                // modelName = `openai/${modelName}`;
             } else if (input.provider === 'openrouter' && !modelName.startsWith('openrouter/')) {
                 // Prefix OpenRouter models if not already prefixed
                modelName = `openrouter/${modelName}`;
             }
             console.log(`Avatar ${input.avatarId} using model: ${modelName}`);
             // Return the potentially modified model name
             const selectedModel = ai.getModel(modelName); // Use ai.getModel to ensure it's registered
             if (!selectedModel) {
                console.error(`Model ${modelName} not found or configured! Falling back.`);
                // Fallback logic: try a default model or throw error
                const fallbackModel = ai.getModel('google/gemini-1.5-flash-latest') || ai.getModel('openai/gpt-3.5-turbo'); // Example fallback
                if (!fallbackModel) throw new Error(`Model ${modelName} not found and no fallback available.`);
                return fallbackModel;
             }
             return selectedModel;
        },
        // Add config for API key if necessary, although plugins should handle it
        // config: (input) => ({ apiKey: input.apiKey }), // May not be needed if plugins are configured correctly
    });

    // Assign the actual flow function
    avatarDecisionGenkitFlow = ai.defineFlow<
      typeof AvatarDecisionInputSchema,
      typeof AvatarDecisionOutputSchema
    >(
      {
        name: 'avatarDecisionFlow',
        inputSchema: AvatarDecisionInputSchema,
        outputSchema: AvatarDecisionOutputSchema,
      },
      async (input) => {

        console.log(`Running decision flow for ${input.avatarId}...`);

        let output: AvatarDecisionOutput | undefined;
        try {
             const response = await decisionPrompt(input); // Call the prompt directly
             output = response.output;
        } catch (error: any) {
             console.error(`Avatar ${input.avatarId}: Error during decisionPrompt execution:`, error.message, error.stack);
              // Provide a default 'idle' decision on error
              output = {
                action: 'idle',
                parameters: { duration: 1000 },
                thought: `Error during decision generation: ${error.message}`
              };
        }


        // Perform basic validation/correction if necessary
         if (!output) {
            console.error(`Avatar ${input.avatarId}: LLM failed to generate a decision output.`);
            // Ensure a valid fallback decision is always returned
            return {
               action: 'idle',
               parameters: { duration: 1500 }, // Longer idle on failure
               thought: "LLM failed to generate a valid decision output."
            };
         }

          // Ensure thought is present, provide default if not
          if (!output.thought) {
              output.thought = `Decided to ${output.action}.`;
          }

          // Validate parameters based on action
          output.parameters = output.parameters || {}; // Ensure parameters object exists

          switch (output.action) {
              case 'turn':
                  if (output.parameters?.angle === undefined || isNaN(output.parameters.angle)) {
                      console.warn(`Avatar ${input.avatarId}: Invalid or missing angle for turn action. Defaulting to 0.`);
                      output.parameters.angle = 0;
                  } else {
                      // Clamp angle
                      output.parameters.angle = Math.max(-180, Math.min(180, output.parameters.angle));
                      // Snap to 30-degree increments
                      output.parameters.angle = Math.round(output.parameters.angle / 30) * 30;
                  }
                  break;
              case 'move':
                   if (output.parameters?.distance === undefined || isNaN(output.parameters.distance)) {
                       console.warn(`Avatar ${input.avatarId}: Invalid or missing distance for move action. Defaulting to 0.`);
                       output.parameters.distance = 0;
                   } else {
                       // Clamp distance to a reasonable step size
                       output.parameters.distance = Math.max(-15, Math.min(15, output.parameters.distance));
                   }
                  break;
              case 'interact_object':
              case 'initiate_conversation':
              case 'disengage_conversation':
                  if (!output.parameters?.targetId) {
                      console.warn(`Avatar ${input.avatarId}: Missing targetId for ${output.action}. Defaulting to idle.`);
                      output.action = 'idle';
                      output.parameters = { duration: 500 }; // Idle for a short time
                      output.thought += ` (Switched to idle due to missing targetId for ${output.action})`;
                  }
                  break;
              case 'continue_conversation':
                  if (!output.parameters?.targetId) {
                      console.warn(`Avatar ${input.avatarId}: Missing targetId for ${output.action}. Defaulting to idle.`);
                      output.action = 'idle';
                      output.parameters = { duration: 500 };
                      output.thought += ` (Switched to idle due to missing targetId for ${output.action})`;
                  } else if (!output.parameters?.message) {
                       console.warn(`Avatar ${input.avatarId}: Missing message for ${output.action}. Defaulting to idle.`);
                       output.action = 'idle';
                       output.parameters = { duration: 500 };
                       output.thought += ` (Switched to idle due to missing message for ${output.action})`;
                  }
                  break;
               case 'think':
               case 'idle':
                    if (output.parameters?.duration === undefined || isNaN(output.parameters.duration) || output.parameters.duration <= 0) {
                         output.parameters.duration = 500; // Default pause
                    }
                    // Clamp duration to prevent excessively long pauses
                    output.parameters.duration = Math.min(5000, Math.max(100, output.parameters.duration));
                    break;
          }

        console.log(`Avatar ${input.avatarId} decision: ${output.action}`, output.parameters);
        return output;
      }
    );

} // End of 'else' block (where 'ai' is defined)

// --- Export the async wrapper function ---
export async function runAvatarDecisionFlow(input: AvatarDecisionInput): Promise<AvatarDecisionOutput> {
  if (!avatarDecisionGenkitFlow) { // Check if the flow function is assigned
      // This case should ideally not be reached if the initial check worked, but acts as a safeguard.
      console.error("avatarDecisionGenkitFlow is not initialized. 'ai' instance might be unavailable.");
      throw new Error("'ai' instance is not available or flow not initialized.");
  }
   // Ensure provider and model are passed from avatar settings
   const flowInput = {
     ...input,
     provider: input.provider,
     model: input.model,
     apiKey: input.apiKey, // Pass API key if needed by the prompt/model config
   };
  return avatarDecisionGenkitFlow(flowInput); // Call the internal flow function
}
