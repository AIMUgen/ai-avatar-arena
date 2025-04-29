
export type LLMProvider = "google" | "openai" | "openrouter";

export type SimulationMode = "turn-based" | "time-based";

export interface Vector2 {
  x: number;
  y: number;
}

export interface Eyesight {
  radius: number;
  angle: number; // Always 180 degrees for now, but keep for potential future flexibility
}

export interface AvatarSettings {
  provider: LLMProvider;
  model: string; // Specific model ID
  apiKey: string; // Store securely or manage appropriately
  rateLimit: number; // Milliseconds per decision
  eyesight: Eyesight;
  systemPrompt: string;
}

export interface AvatarState {
  id: string;
  position: Vector2;
  orientation: number; // Angle in degrees (0-359)
  settings: AvatarSettings;
  color: string; // Unique color for visualization
  currentAction?: string; // e.g., "moving", "thinking", "conversing"
  conversationTarget?: string; // ID of the avatar being conversed with
  lastActionTime?: number; // Timestamp for rate limiting
  thought?: string; // Last thought generated
  nextDecisionTime?: number; // Timestamp when the avatar can make its next decision
}

export interface ArenaObject {
  id: string;
  position: Vector2;
  description: string; // Custom note
  type: 'object';
}

export interface Obstacle {
  id: string;
  position: Vector2;
  size: Vector2; // Width and height
  type: 'obstacle';
}

export type ArenaEntity = AvatarState | ArenaObject | Obstacle;

export interface ConversationMessage {
  avatarId: string;
  text: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  participants: [string, string]; // Avatar IDs
  messages: ConversationMessage[];
  startTime: number;
  endTime?: number;
}

export interface SimulationSettings {
  mode: SimulationMode;
  boardSize: { width: number; height: number };
  turnDuration?: number; // Only for turn-based mode
  timeScale?: number; // Only for time-based mode (e.g., 1x, 2x speed)
}

export interface SimulationLogEntry {
    timestamp: number;
    message: string;
    level: 'info' | 'warning' | 'error' | 'debug'; // Added level
    avatarId?: string; // Optional: associate log with an avatar
}

export interface AppState {
  avatars: AvatarState[];
  objects: ArenaObject[];
  obstacles: Obstacle[];
  conversations: Conversation[];
  simulation: SimulationSettings;
  isRunning: boolean;
  simulationLogs: SimulationLogEntry[]; // Added simulation logs
}

// Define the possible actions as a type
export type LLMDecisionAction = 'turn' | 'move' | 'interact_object' | 'initiate_conversation' | 'continue_conversation' | 'disengage_conversation' | 'think' | 'idle';

// LLM Decision structure
export interface LLMDecision {
    action: LLMDecisionAction; // Use the defined type
    parameters?: {
        angle?: number; // For 'turn' (relative degrees, e.g., -90 for left, 90 for right)
        distance?: number; // For 'move' (positive for forward, negative for backward)
        targetId?: string; // For 'interact_object', 'initiate_conversation', 'continue_conversation'
        message?: string; // For 'initiate_conversation', 'continue_conversation'
        duration?: number; // For 'idle' or 'think' (how long to pause before next decision, in ms)
    };
    thought?: string; // Rationale for the chosen action
}

// Input for the LLM decision flow
export interface AvatarDecisionInput {
    avatarId: string;
    avatarSystemPrompt: string;
    position: Vector2;
    orientation: number;
    currentAction?: string;
    conversationTarget?: string;
    conversationHistory?: ConversationMessage[]; // Last few messages if in conversation
    visibleAvatars: { id: string; position: Vector2; distance: number }[];
    visibleObjects: { id: string; position: Vector2; description: string; distance: number }[];
    visibleObstacles: { id: string; position: Vector2; size: Vector2; distance: number }[];
    boardSize: { width: number; height: number };
    availableActions: LLMDecisionAction[]; // Use the defined type
    // Include LLM config info needed by the flow/prompt
    provider: LLMProvider;
    model: string;
    apiKey?: string; // API key might be optional if globally configured
}

// Output from the LLM decision flow
export interface AvatarDecisionOutput extends LLMDecision {}

// Input for object interaction flow
export interface ProcessObjectInteractionInput {
    objectId: string;
    objectDescription: string;
    avatarSystemPrompt: string;
    // Include LLM config
    provider: LLMProvider;
    model: string;
    apiKey?: string;
}

// Input for reflection flow
export interface AvatarReflectionInput {
    reflectionPrompt: string; // The thought to reflect on
    // Include LLM config
    provider: LLMProvider;
    model: string;
    apiKey?: string;
}


export interface LLMProvidersConfig {
  google: { models: string[] };
  openai: { models: string[] };
  openrouter: { models: string[] }; // Specifically free ones
}
