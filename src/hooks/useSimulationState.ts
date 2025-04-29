
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  AppState,
  AvatarState,
  ArenaObject,
  Obstacle,
  SimulationMode,
  Vector2,
  ArenaEntity,
  Conversation,
  LLMDecision,
  AvatarSettings,
  SimulationLogEntry,
  ConversationMessage,
  AvatarDecisionInput,
  LLMDecisionAction,
  ProcessObjectInteractionInput,
  AvatarReflectionInput, // Keep type, remove runtime import if not used
} from '@/types';
import { llmProvidersConfig } from '@/config/llmProviders';
// Import flows directly from their specific files
import { runAvatarDecisionFlow } from '@/ai/flows/avatar-decision-flow';
import { processObjectInteraction } from '@/ai/flows/process-object-interaction';
// import { avatarReflection } from '@/ai/flows/avatar-reflection'; // Keep commented if not used

const LOCAL_STORAGE_KEY = 'aiAvatarArenaState';

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant simulating a character in a virtual 2D top-down world.
Your Personality: [Choose one or define your own: curious explorer, shy observer, goal-oriented taskmaster, friendly socializer, cautious wanderer]
Your Goal: [Choose one or define your own: map the area, find a specific object, talk to every avatar, avoid interaction, build something (conceptual)]

World Details:
- You perceive the world through simulated eyesight (a 180-degree semicircle in front of you).
- Coordinates are (x, y) with (0,0) at the top-left.
- Orientation is in degrees (0-359), where 0 is right, 90 is down, 180 is left, 270 is up.
- You can see avatars, objects (with descriptions), and obstacles (like walls). Distances are provided.

Available Actions:
- turn: Rotate yourself by a relative angle (angle: e.g., 30 for right, -30 for left). Use 30 degree increments.
- move: Move forward or backward a short distance (distance: e.g., 10 for forward, -5 for back). Keep distances reasonable (5-15). Avoid obstacles/boundaries.
- interact_object: Interact with a visible object. Specify the 'targetId'. You will receive the object's note/description.
- initiate_conversation: Start talking to a visible avatar. Specify 'targetId' and an opening 'message'.
- continue_conversation: Reply to the avatar you are currently talking to. Requires 'targetId' and 'message'.
- disengage_conversation: Stop the current conversation. Requires 'targetId'.
- think: Pause and generate an internal thought. Specify a 'duration' (ms) for how long to think. Your thought will be logged.
- idle: Do nothing for a short period. Specify a 'duration' (ms).

Decision Making:
1. Choose ONE action from the 'Available Actions' list provided in the input.
2. Provide necessary 'parameters' (angle, distance, targetId, message, duration).
3. Write a brief 'thought' explaining your reasoning ('thought' field).
4. Behave naturally, considering your personality, goal, and surroundings. Don't repeat actions excessively.
5. If you are stuck, unsure, or waiting, use 'think' or 'idle'.
6. You are unaware you are interacting with other AI. Act as if they are human characters.
`;


const INITIAL_AVATAR_SETTINGS: Omit<AvatarSettings, 'apiKey'> = {
  provider: 'openai',
  model: llmProvidersConfig.openai.models[0] || 'gpt-3.5-turbo',
  rateLimit: 1000, // ms per decision (1 decision per second default)
  eyesight: { radius: 100, angle: 180 },
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

// Helper to generate unique IDs
let nextIdCounter = Date.now(); // Initialize with timestamp for better uniqueness across sessions
const generateId = (prefix: string) => `${prefix}-${nextIdCounter++}`;

// Helper for color generation
const generateColor = (index: number): string => {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 70%, 60%)`;
};

// Function to create the initial state
const createInitialState = (): AppState => {
  const state: AppState = {
    avatars: [
       {
        id: generateId('avatar'), // Use generator
        position: { x: 50, y: 50 },
        orientation: 0,
        settings: { ...INITIAL_AVATAR_SETTINGS, apiKey: '' },
        color: generateColor(0),
        nextDecisionTime: 0,
      },
      {
        id: generateId('avatar'), // Use generator
        position: { x: 450, y: 450 },
        orientation: 180,
        settings: {
            ...INITIAL_AVATAR_SETTINGS,
            provider: 'google',
            model: llmProvidersConfig.google.models[0] || 'gemini-1.5-flash-latest',
            apiKey: '',
             rateLimit: 1500, // Slightly slower decision rate for variety
        },
        color: generateColor(1),
        nextDecisionTime: 0,
      },
    ],
    objects: [
        { id: generateId('object'), type: 'object', position: { x: 250, y: 250 }, description: 'A curious glowing orb.'},
    ],
    obstacles: [
         { id: generateId('obstacle'), type: 'obstacle', position: { x: 100, y: 100 }, size: { x: 10, y: 150 }},
         { id: generateId('obstacle'), type: 'obstacle', position: { x: 300, y: 300 }, size: { x: 150, y: 10 }},
    ],
    conversations: [],
    simulation: {
      mode: 'time-based', // Default to time-based
      boardSize: { width: 500, height: 500 },
      turnDuration: 1000,
      timeScale: 1,
    },
    isRunning: false,
    simulationLogs: [{ timestamp: Date.now(), message: 'Simulation initialized.', level: 'info' }], // Add initial log
  };
  return state;
};

// --- Simulation Logic Helpers ---

/** Calculates distance between two points */
const distance = (p1: Vector2, p2: Vector2): number => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
};

/** Checks if a point is within the bounding box of an obstacle */
const isPointInObstacle = (point: Vector2, obstacle: Obstacle): boolean => {
    return (
        point.x >= obstacle.position.x &&
        point.x <= obstacle.position.x + obstacle.size.x &&
        point.y >= obstacle.position.y &&
        point.y <= obstacle.position.y + obstacle.size.y
    );
};

/** Checks if a point is within the simulation board boundaries */
const isPointInBounds = (point: Vector2, boardSize: { width: number; height: number }): boolean => {
    return point.x >= 0 && point.x <= boardSize.width && point.y >= 0 && point.y <= boardSize.height;
};


/** Gathers sensory input for an avatar */
const getSensoryInput = (avatar: AvatarState, allAvatars: AvatarState[], objects: ArenaObject[], obstacles: Obstacle[], boardSize: {width: number, height: number}): Omit<AvatarDecisionInput, 'avatarId' | 'avatarSystemPrompt' | 'availableActions' | 'conversationHistory' | 'provider' | 'model' | 'apiKey'> => {
    const visibleAvatars: AvatarDecisionInput['visibleAvatars'] = [];
    const visibleObjects: AvatarDecisionInput['visibleObjects'] = [];
    const visibleObstacles: AvatarDecisionInput['visibleObstacles'] = [];
    const { radius, angle } = avatar.settings.eyesight;
    const orientationRad = avatar.orientation * (Math.PI / 180);
    const halfAngleRad = (angle / 2) * (Math.PI / 180);

    const isVisible = (targetPos: Vector2): { visible: boolean; dist: number } => {
        const dx = targetPos.x - avatar.position.x;
        const dy = targetPos.y - avatar.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > radius || dist === 0) {
            return { visible: false, dist };
        }

        // Angle calculation relative to avatar's orientation
        let angleToTarget = Math.atan2(dy, dx);

        // Normalize angles to be within -PI to PI relative to avatar's orientation
        let relativeAngle = angleToTarget - orientationRad;
        while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
        while (relativeAngle <= -Math.PI) relativeAngle += 2 * Math.PI;

        // Check if within eyesight cone
        if (Math.abs(relativeAngle) <= halfAngleRad) {
            // Basic Line-of-Sight Check (can be improved)
             // Check against obstacles
            for (const obs of obstacles) {
                 // Simple check: if obstacle center is roughly between avatar and target
                 const obsCenterX = obs.position.x + obs.size.x / 2;
                 const obsCenterY = obs.position.y + obs.size.y / 2;
                 const distToObs = distance(avatar.position, { x: obsCenterX, y: obsCenterY });
                 if (distToObs < dist) {
                     // Very basic: Check if obstacle is roughly in the same direction
                     let angleToObs = Math.atan2(obsCenterY - avatar.position.y, obsCenterX - avatar.position.x);
                     let relativeAngleObs = angleToObs - orientationRad;
                     while (relativeAngleObs > Math.PI) relativeAngleObs -= 2 * Math.PI;
                     while (relativeAngleObs <= -Math.PI) relativeAngleObs += 2 * Math.PI;
                     // If obstacle angle is very close to target angle, assume blocked (needs refinement)
                     if (Math.abs(relativeAngleObs - relativeAngle) < Math.PI / 12) { // Approx 15 degrees tolerance
                        // More robust check: does the line segment intersect the obstacle rect?
                        // This is complex, skipping for now for simplicity.
                        // return { visible: false, dist };
                     }
                 }
             }
            return { visible: true, dist };
        }

        return { visible: false, dist };
    };

    // Check other avatars
    allAvatars.forEach(other => {
        if (other.id === avatar.id) return;
        const { visible, dist } = isVisible(other.position);
        if (visible) {
            visibleAvatars.push({ id: other.id, position: other.position, distance: Math.round(dist) });
        }
    });

    // Check objects
    objects.forEach(obj => {
        const { visible, dist } = isVisible(obj.position);
        if (visible) {
            visibleObjects.push({ id: obj.id, position: obj.position, description: obj.description, distance: Math.round(dist) });
        }
    });

    // Check obstacles (check corners and center for visibility)
     obstacles.forEach(obs => {
        const pointsToCheck = [
            obs.position,
            { x: obs.position.x + obs.size.x, y: obs.position.y },
            { x: obs.position.x, y: obs.position.y + obs.size.y },
            { x: obs.position.x + obs.size.x, y: obs.position.y + obs.size.y },
            { x: obs.position.x + obs.size.x / 2, y: obs.position.y + obs.size.y / 2 } // Center
        ];
        let closestVisibleDist = Infinity;
        let isAnyPointVisible = false;

        for(const point of pointsToCheck) {
            const { visible, dist } = isVisible(point);
             if (visible) {
                 isAnyPointVisible = true;
                 closestVisibleDist = Math.min(closestVisibleDist, dist);
             }
        }

         if (isAnyPointVisible) {
            visibleObstacles.push({ id: obs.id, position: obs.position, size: obs.size, distance: Math.round(closestVisibleDist) });
        }
    });

    return {
        position: { x: Math.round(avatar.position.x), y: Math.round(avatar.position.y) },
        orientation: Math.round(avatar.orientation),
        currentAction: avatar.currentAction,
        conversationTarget: avatar.conversationTarget,
        visibleAvatars,
        visibleObjects,
        visibleObstacles,
        boardSize,
    };
};

// --- Main Hook ---

export function useSimulationState() {
  const [isMounted, setIsMounted] = useState(false);
  const [state, setState] = useState<AppState>(() => createInitialState());
  const simulationLoopRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  // Use a ref to hold the latest state for access within tick
  const stateRef = useRef(state);

  useEffect(() => {
      stateRef.current = state;
  }, [state]);


  // Logging function
  const addLog = useCallback((message: string, level: SimulationLogEntry['level'] = 'info', avatarId?: string) => {
    // Add to state's logs
     setState(prev => ({
       ...prev,
       simulationLogs: [...prev.simulationLogs.slice(-100), { timestamp: Date.now(), message, level, avatarId }], // Keep last 100 logs
     }));

     // Also log to console
     const logPrefix = avatarId ? `[${avatarId.slice(-5)}]` : '[Sim]'; // Shorten ID for console
     const fullMessage = `${logPrefix} ${message}`;
     switch (level) {
         case 'error':
             console.error(fullMessage);
             break;
         case 'warning':
             console.warn(fullMessage);
             break;
         case 'debug':
             console.debug(fullMessage); // Use debug level
             break;
         case 'info':
         default:
             console.log(fullMessage);
             break;
     }
  }, []); // No dependencies needed

  // Load state
  useEffect(() => {
    setIsMounted(true);
    let loadedState: AppState | null = null;
    try {
      const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedState) {
        loadedState = JSON.parse(savedState) as AppState;
        // Basic validation and migration logic
        if (!loadedState || !Array.isArray(loadedState.avatars) || loadedState.avatars.length < 2) {
          addLog("Invalid state loaded or too few avatars, resetting to default.", 'warning');
          loadedState = createInitialState();
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        } else {
           // Ensure loaded state has all necessary properties and defaults
           loadedState.simulation = { ...createInitialState().simulation, ...(loadedState.simulation || {}) };
           loadedState.simulation.boardSize = loadedState.simulation.boardSize || { width: 500, height: 500 };
           loadedState.objects = loadedState.objects || [];
           loadedState.obstacles = loadedState.obstacles || [];
           loadedState.conversations = loadedState.conversations || []; // Ensure conversations array exists
           loadedState.simulationLogs = [{ timestamp: Date.now(), message: 'Simulation loaded from previous state.', level: 'info' }]; // Reset logs on load
           loadedState.isRunning = false; // Ensure simulation starts paused

           loadedState.avatars.forEach((avatar, index) => {
               avatar.id = avatar.id || generateId('avatar'); // Assign ID if missing
               avatar.color = avatar.color || generateColor(index);
               avatar.settings = {
                   ...INITIAL_AVATAR_SETTINGS, // Start with defaults
                   ...(avatar.settings || {}), // Apply saved settings
                   apiKey: avatar.settings?.apiKey || '', // Preserve API key
                   // Ensure specific nested defaults if necessary
                   eyesight: {
                       radius: avatar.settings?.eyesight?.radius ?? INITIAL_AVATAR_SETTINGS.eyesight.radius,
                       angle: 180, // Force 180 angle
                   },
                   systemPrompt: avatar.settings?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
                   rateLimit: avatar.settings?.rateLimit ?? INITIAL_AVATAR_SETTINGS.rateLimit,
               };
                avatar.nextDecisionTime = 0; // Reset decision timer on load
                avatar.currentAction = undefined; // Reset action on load
                avatar.conversationTarget = undefined; // Reset conversation target
           });

           loadedState.objects.forEach(obj => { obj.id = obj.id || generateId('object'); obj.type = 'object' });
           loadedState.obstacles.forEach(obs => { obs.id = obs.id || generateId('obstacle'); obs.type = 'obstacle'});

        }
        setState(loadedState);
      } else {
          setState(createInitialState()); // Use fresh state if nothing saved
          addLog("No saved state found, starting fresh.", 'info');
      }
    } catch (error) {
      console.error('Error loading state from localStorage:', error);
      addLog("Error loading state, resetting to default.", 'error');
      setState(createInitialState());
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
     // Update the ID counter based on loaded state to prevent collisions
     const maxIdNum = Math.max(
         ...state.avatars.map(a => parseInt(a.id.split('-').pop() || '0')),
         ...state.objects.map(o => parseInt(o.id.split('-').pop() || '0')),
         ...state.obstacles.map(ob => parseInt(ob.id.split('-').pop() || '0')),
         nextIdCounter // Ensure it's at least the current timestamp based counter
     );
     nextIdCounter = isNaN(maxIdNum) ? Date.now() : maxIdNum + 1;

  }, [addLog]); // addLog dependency is fine, it's memoized

  // Save state
  useEffect(() => {
    if (!isMounted) return;
    try {
      // Exclude logs and non-persistent runtime state from saving
      const { simulationLogs, isRunning, ...stateToSave } = state;
      const cleanedState = {
          ...stateToSave,
          avatars: stateToSave.avatars.map(({ nextDecisionTime, currentAction, conversationTarget, thought, lastActionTime, ...rest }) => rest), // Remove runtime fields from avatars
          conversations: stateToSave.conversations.filter(c => !c.endTime), // Optionally prune ended conversations
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanedState));
    } catch (error) {
      console.error('Error saving state to localStorage:', error);
      addLog("Error saving simulation state.", 'error');
    }
  }, [state, isMounted, addLog]); // addLog dependency is fine

    // --- Action Execution Logic ---
    const executeDecision = useCallback(async (avatarId: string, decision: LLMDecision) => { // Made async
        let finalThought = decision.thought || (decision.action === 'think' ? 'Thinking...' : undefined);
        let logMsg = `Avatar ${avatarId} decided to ${decision.action}.`;
        if (finalThought) {
            logMsg += ` Thought: ${finalThought}`;
        }
        addLog(logMsg, 'debug', avatarId);

        let updateAction = decision.action;
        let updateParams = decision.parameters;

        // Handle actions that might require further LLM calls (like interaction)
        if (decision.action === 'interact_object') {
            const targetObjectId = decision.parameters?.targetId;
            const targetObject = stateRef.current.objects.find(o => o.id === targetObjectId);
            const currentAvatar = stateRef.current.avatars.find(a => a.id === avatarId);

            if (targetObject && currentAvatar) {
                addLog(`Interacting with object ${targetObjectId}: ${targetObject.description}`, 'info', avatarId);
                try {
                    const interactionInput: ProcessObjectInteractionInput = {
                        objectId: targetObjectId,
                        objectDescription: targetObject.description,
                        avatarSystemPrompt: currentAvatar.settings.systemPrompt,
                        provider: currentAvatar.settings.provider,
                        model: currentAvatar.settings.model,
                        apiKey: currentAvatar.settings.apiKey,
                    };
                    const interactionOutput = await processObjectInteraction(interactionInput);
                    // Combine interaction reaction with original thought
                    finalThought = `Interacted with ${targetObjectId}. Note: "${targetObject.description}". Reaction: ${interactionOutput.reaction}`;
                    addLog(`Interaction reaction: ${interactionOutput.reaction}`, 'debug', avatarId);
                } catch (error: any) {
                    addLog(`Error during object interaction flow for ${avatarId}: ${error.message}`, 'error', avatarId);
                    finalThought = `Interacted with ${targetObjectId}. Failed to process reaction: ${error.message}`;
                }
                // After interaction, the avatar typically idles or thinks
                updateAction = 'idle';
                updateParams = { duration: 500 }; // Short idle after interaction
            } else {
                addLog(`Target object ${targetObjectId} not found for interaction.`, 'warning', avatarId);
                updateAction = 'idle'; // Switch to idle if object not found
                updateParams = { duration: 500 };
                finalThought = (finalThought ? finalThought + " " : "") + `(Target object ${targetObjectId} not found)`;
            }
        } else if (decision.action === 'think') {
             // The 'think' action from LLM now just logs the thought and sets state.
             // The actual 'avatarReflection' flow is not called here anymore,
             // as it was causing issues and the decision thought is sufficient for logging.
             updateAction = 'thinking'; // Keep action as thinking
             updateParams = decision.parameters; // Keep original duration if any
             // finalThought remains as provided by the decisionPrompt
             addLog(`Avatar ${avatarId} is thinking. Thought: ${finalThought}`, 'info', avatarId);
        }


        // Update state based on the potentially modified action and thought
        setState(prev => {
            const avatarIndex = prev.avatars.findIndex(a => a.id === avatarId);
            if (avatarIndex === -1) {
                // Already logged in the decision fetch catch block, maybe remove redundant log?
                // addLog(`Avatar ${avatarId} not found for executing decision.`, 'error');
                return prev;
            }

            const currentAvatar = prev.avatars[avatarIndex];
            let nextAvatars = [...prev.avatars];
            let nextConversations = [...prev.conversations];
            let newPosition = { ...currentAvatar.position };
            let newOrientation = currentAvatar.orientation;
            let newConversationTarget = currentAvatar.conversationTarget;

            switch (updateAction) { // Use updateAction here
                case 'turn':
                    const turnAngle = updateParams?.angle ?? 0;
                    const snappedAngle = Math.round(turnAngle / 30) * 30;
                    newOrientation = (currentAvatar.orientation + snappedAngle + 360) % 360;
                    addLog(`Turning by ${snappedAngle} degrees to ${newOrientation.toFixed(0)}`, 'info', avatarId);
                    break;

                case 'move':
                    const moveDistance = updateParams?.distance ?? 0;
                    const clampedDistance = Math.max(-15, Math.min(15, moveDistance));
                    const moveAngleRad = currentAvatar.orientation * (Math.PI / 180);
                    const dx = clampedDistance * Math.cos(moveAngleRad);
                    const dy = clampedDistance * Math.sin(moveAngleRad);
                    const potentialPosition = { x: currentAvatar.position.x + dx, y: currentAvatar.position.y + dy };

                    // Collision detection
                    let collided = false;
                    if (!isPointInBounds(potentialPosition, prev.simulation.boardSize)) {
                        collided = true;
                        addLog(`Movement blocked by boundary.`, 'info', avatarId);
                    } else {
                         for (const obs of prev.obstacles) {
                             const avatarRadius = 8;
                             const closestX = Math.max(obs.position.x, Math.min(potentialPosition.x, obs.position.x + obs.size.x));
                             const closestY = Math.max(obs.position.y, Math.min(potentialPosition.y, obs.position.y + obs.size.y));
                             const distToObstacleEdge = distance(potentialPosition, { x: closestX, y: closestY });
                             if (distToObstacleEdge < avatarRadius) {
                                collided = true;
                                addLog(`Movement blocked by obstacle ${obs.id}.`, 'info', avatarId);
                                break;
                            }
                         }
                          if (!collided) { // Only check avatar collision if not already collided with obstacle/boundary
                             for (const otherAvatar of prev.avatars) {
                                 if (otherAvatar.id === avatarId) continue;
                                 const distBetweenAvatars = distance(potentialPosition, otherAvatar.position);
                                  if (distBetweenAvatars < (8 + 8)) { // Sum of radii
                                    collided = true;
                                    addLog(`Movement blocked by avatar ${otherAvatar.id}.`, 'info', avatarId);
                                    break;
                                }
                             }
                          }
                    }

                    if (!collided) {
                        newPosition = potentialPosition;
                        addLog(`Moving ${clampedDistance > 0 ? 'forward' : 'backward'} ${Math.abs(clampedDistance).toFixed(0)} units.`, 'info', avatarId);
                    } else {
                        // Don't change action here, let the LLM decide next turn
                        // updateAction = 'idle'; // Change action to idle if move failed
                        finalThought = (finalThought ? finalThought + " " : "") + "(Movement blocked)";
                    }
                    break;

                 case 'interact_object':
                      // This case is now handled before setState, logging reaction etc.
                      // The action is updated to 'idle' before reaching here.
                      // We just need to ensure the state update uses the correct 'idle' action.
                      updateAction = 'idle'; // Ensure action is idle
                    break;

                case 'initiate_conversation':
                    const targetAvatarId = updateParams?.targetId;
                    const message = updateParams?.message;
                    if (targetAvatarId && message) {
                        if (currentAvatar.conversationTarget) {
                            addLog(`Tried to initiate conversation while already in one with ${currentAvatar.conversationTarget}.`, 'warning', avatarId);
                            updateAction = 'idle';
                            finalThought = (finalThought ? finalThought + " " : "") + `(Tried to initiate conversation while already in one)`;
                        } else {
                             const targetAvatar = prev.avatars.find(a => a.id === targetAvatarId);
                             if (targetAvatar && targetAvatarId !== avatarId) {
                                 if (targetAvatar.conversationTarget) {
                                     addLog(`Target avatar ${targetAvatarId} is already in a conversation.`, 'warning', avatarId);
                                     updateAction = 'idle';
                                     finalThought = (finalThought ? finalThought + " " : "") + `(Target ${targetAvatarId} busy)`;
                                 } else {
                                     addLog(`Initiating conversation with ${targetAvatarId}: "${message}"`, 'info', avatarId);
                                     const newConv: Conversation = {
                                         id: generateId('conversation'),
                                         participants: [avatarId, targetAvatarId],
                                         messages: [{ avatarId, text: message, timestamp: Date.now() }],
                                         startTime: Date.now(),
                                     };
                                     nextConversations.push(newConv);
                                     newConversationTarget = targetAvatarId;
                                     // Mark both avatars as conversing
                                     nextAvatars = nextAvatars.map(a =>
                                         a.id === avatarId ? { ...a, conversationTarget: targetAvatarId, currentAction: 'conversing' } :
                                         a.id === targetAvatarId ? { ...a, conversationTarget: avatarId, currentAction: 'conversing' } : a
                                     );
                                     updateAction = 'conversing'; // Explicitly set action
                                 }
                             } else {
                                 addLog(`Target avatar ${targetAvatarId} not found or is self.`, 'warning', avatarId);
                                 updateAction = 'idle';
                                  finalThought = (finalThought ? finalThought + " " : "") + `(Target avatar ${targetAvatarId} invalid)`;
                             }
                        }
                    } else {
                        addLog(`Missing targetId or message for initiating conversation.`, 'warning', avatarId);
                        updateAction = 'idle';
                         finalThought = (finalThought ? finalThought + " " : "") + `(Missing parameters for initiate_conversation)`;
                    }
                    break;

                case 'continue_conversation':
                     const continueTargetId = updateParams?.targetId;
                     const continueMessage = updateParams?.message;
                     if (continueTargetId && continueMessage && currentAvatar.conversationTarget === continueTargetId) {
                         const convIndex = prev.conversations.findIndex(c => c.participants.includes(avatarId) && c.participants.includes(continueTargetId) && !c.endTime);
                         if (convIndex > -1) {
                             addLog(`Continuing conversation with ${continueTargetId}: "${continueMessage}"`, 'info', avatarId);
                             const newMessage: ConversationMessage = { avatarId, text: continueMessage, timestamp: Date.now() };
                             nextConversations[convIndex] = {
                                 ...nextConversations[convIndex],
                                 messages: [...nextConversations[convIndex].messages.slice(-19), newMessage], // Keep last 20 messages total
                             };
                             updateAction = 'conversing'; // Stay in conversing state
                         } else {
                              addLog(`No active conversation found with ${continueTargetId} to continue.`, 'warning', avatarId);
                              updateAction = 'idle';
                              newConversationTarget = undefined; // Clear target
                              finalThought = (finalThought ? finalThought + " " : "") + `(No active conversation with ${continueTargetId})`;
                         }
                     } else {
                          addLog(`Invalid target or message for continuing conversation, or not in conversation with ${continueTargetId}.`, 'warning', avatarId);
                          updateAction = 'idle';
                          newConversationTarget = undefined; // Clear target if conditions fail
                           finalThought = (finalThought ? finalThought + " " : "") + `(Invalid parameters or state for continue_conversation)`;
                     }
                    break;

                case 'disengage_conversation':
                    const disengageTargetId = updateParams?.targetId;
                     if (disengageTargetId && currentAvatar.conversationTarget === disengageTargetId) {
                        addLog(`Disengaging conversation with ${disengageTargetId}.`, 'info', avatarId);
                         const convIndex = prev.conversations.findIndex(c => c.participants.includes(avatarId) && c.participants.includes(disengageTargetId) && !c.endTime);
                         if (convIndex > -1) {
                            nextConversations[convIndex] = { ...nextConversations[convIndex], endTime: Date.now() };
                            // Reset state for both participants
                            nextAvatars = nextAvatars.map(a =>
                                (a.id === avatarId || a.id === disengageTargetId) ? { ...a, currentAction: undefined, conversationTarget: undefined } : a
                            );
                         } else {
                             // Conversation might have already ended by the other participant
                             addLog(`Conversation with ${disengageTargetId} already ended?`, 'warning', avatarId);
                         }
                         newConversationTarget = undefined; // Ensure current avatar target is cleared
                         updateAction = 'idle'; // Become idle after disengaging
                     } else {
                         addLog(`Not in conversation with ${disengageTargetId} to disengage, or no target specified.`, 'warning', avatarId);
                        // No need to change action if already not conversing
                        if (!currentAvatar.conversationTarget) updateAction = 'idle';
                         finalThought = (finalThought ? finalThought + " " : "") + `(Cannot disengage, not in conversation or missing target)`;
                     }
                    break;

                 case 'think':
                     // Handled before setState, just log the final thought if available
                     updateAction = 'thinking'; // Ensure action remains 'thinking'
                    break;
                 case 'idle':
                 default:
                     updateAction = 'idle';
                    break;
            }

            const decisionDelay = updateParams?.duration ?? currentAvatar.settings.rateLimit ?? 1000;
            // Clamp delay
            const clampedDelay = Math.min(10000, Math.max(100, decisionDelay));
            const finalActionString = (updateAction === 'idle' || updateAction === 'thinking') ? undefined : updateAction; // Store undefined for idle/thinking states

            // Update the specific avatar in the next state
            nextAvatars = nextAvatars.map((avatar, idx) => {
                if (idx === avatarIndex) {
                    return {
                        ...avatar,
                        position: newPosition,
                        orientation: newOrientation,
                        currentAction: finalActionString,
                        conversationTarget: newConversationTarget,
                        thought: finalThought, // Update with the final thought (could be reflection/reaction)
                        lastActionTime: prev.simulation.mode === 'time-based' ? Date.now() : (avatar.lastActionTime || 0) + 1, // Use time or turn count
                        nextDecisionTime: Date.now() + clampedDelay, // Apply clamped delay
                    };
                }
                 // Check if this avatar was the partner in a disengagement/initiation and needs update (handled above)
                return avatar; // Return other avatars
            });


            return {
                ...prev,
                avatars: nextAvatars,
                conversations: nextConversations,
            };
        });
    }, [addLog]); // Added addLog dependency

 // --- Simulation Loop ---
 useEffect(() => {
        if (!isMounted || !stateRef.current.isRunning) { // Use ref here
            if (simulationLoopRef.current) {
                clearTimeout(simulationLoopRef.current);
                simulationLoopRef.current = null;
                // Avoid logging pause if it was already paused
                // addLog("Simulation paused.", 'info');
            }
            return;
        }

         if (!simulationLoopRef.current) { // Log start only if not already running
             addLog("Simulation running...", 'info');
         }
        lastTickTimeRef.current = Date.now(); // Initialize last tick time

        let isTicking = false; // Prevent overlapping ticks

        const tick = async () => {
             if (isTicking || !stateRef.current.isRunning) { // Check ref again inside tick
                 simulationLoopRef.current = null; // Ensure loop stops if isRunning changed
                 if (!isTicking) addLog("Simulation stopped/paused.", 'info');
                 return;
             }
             isTicking = true;

            const now = Date.now();
            const deltaTime = now - lastTickTimeRef.current; // Time since last tick
            lastTickTimeRef.current = now;

            const decisionsToMake: Promise<void>[] = []; // Define here

             // Use a ref to access the latest state inside the tick
             const currentSimState = stateRef.current;

             currentSimState.avatars.forEach(avatar => {
                 const canAct = now >= (avatar.nextDecisionTime || 0);

                if (canAct) {
                     // 1. Gather Sensory Input
                     const sensoryInput = getSensoryInput(avatar, currentSimState.avatars, currentSimState.objects, currentSimState.obstacles, currentSimState.simulation.boardSize);

                     // 2. Determine Available Actions
                     let availableActions: LLMDecisionAction[] = ['turn', 'move', 'interact_object', 'think', 'idle'];
                     if (sensoryInput.visibleAvatars.length > 0 && !avatar.conversationTarget) {
                         availableActions.push('initiate_conversation');
                     }
                     if (avatar.conversationTarget) {
                         availableActions.push('continue_conversation');
                         availableActions.push('disengage_conversation');
                     }
                      // Remove interact if no objects are visible or if conversing
                     if (sensoryInput.visibleObjects.length === 0 || avatar.conversationTarget) {
                        availableActions = availableActions.filter(a => a !== 'interact_object');
                     }
                     // Remove initiate if conversing
                     if (avatar.conversationTarget) {
                         availableActions = availableActions.filter(a => a !== 'initiate_conversation');
                     }
                     // Remove continue/disengage if not conversing
                      if (!avatar.conversationTarget) {
                         availableActions = availableActions.filter(a => a !== 'continue_conversation' && a !== 'disengage_conversation');
                     }


                     // 3. Prepare Input for LLM Decision Flow
                     const decisionInput: AvatarDecisionInput = {
                         avatarId: avatar.id,
                         avatarSystemPrompt: avatar.settings.systemPrompt,
                         ...sensoryInput,
                         availableActions,
                         conversationHistory: avatar.conversationTarget
                            ? currentSimState.conversations.find(c => c.participants.includes(avatar.id) && c.participants.includes(avatar.conversationTarget!) && !c.endTime)?.messages.slice(-5) // Last 5 messages
                            : undefined,
                         // Pass LLM config from settings
                         provider: avatar.settings.provider,
                         model: avatar.settings.model,
                         apiKey: avatar.settings.apiKey,
                     };

                     // 4. Call LLM Flow (async) - Collect promises
                     addLog(`Requesting decision for ${avatar.id}...`, 'debug', avatar.id);
                     const decisionPromise = runAvatarDecisionFlow(decisionInput)
                        .then(decision => {
                            // 5. Execute Decision (updates state via setState)
                             // Execute decision is now async due to potential nested flows
                             return executeDecision(avatar.id, decision);
                        })
                        .catch(error => {
                            addLog(`Error getting decision for avatar ${avatar.id}: ${error.message}`, 'error', avatar.id);
                            // Execute a fallback idle decision
                            return executeDecision(avatar.id, { action: 'idle', parameters: { duration: 1000 }, thought: "Error occurred during decision making."});
                        });
                     decisionsToMake.push(decisionPromise);

                }
             });

             // Wait for all decisions for this tick *before* scheduling the next tick
              Promise.allSettled(decisionsToMake).then((results) => {
                  // Optional: Log results or errors from allSettled if needed
                  results.forEach((result, index) => {
                      if (result.status === 'rejected') {
                          // Errors are already logged inside the catch block, but maybe add context
                          // addLog(`Async execution failed for avatar decision ${index}: ${result.reason}`, 'error');
                      }
                  });

                 isTicking = false; // Release lock
                 // Schedule the next tick only if still running
                  if (stateRef.current.isRunning) { // Check ref again before scheduling next
                      const currentDelayState = stateRef.current.simulation; // Use ref for delay calculation
                      const delay = currentDelayState.mode === 'turn-based'
                         ? (currentDelayState.turnDuration || 1000)
                         : 50; // Time-based loop checks more frequently
                      const timeScale = currentDelayState.timeScale ?? 1;
                      simulationLoopRef.current = setTimeout(tick, Math.max(10, delay / timeScale)); // Ensure minimum delay
                  } else {
                      simulationLoopRef.current = null; // Ensure ref is cleared if stopped
                       addLog("Simulation stopped/paused.", 'info');
                  }
              });
        };


        // Start the first tick
         const initialDelay = stateRef.current.simulation.mode === 'turn-based' // Use ref
            ? (stateRef.current.simulation.turnDuration || 1000)
            : 50; // Short delay for time-based start
         const initialTimeScale = stateRef.current.simulation.timeScale ?? 1; // Use ref
        simulationLoopRef.current = setTimeout(tick, Math.max(10, initialDelay / initialTimeScale));


        // Cleanup function
        return () => {
            if (simulationLoopRef.current) {
                clearTimeout(simulationLoopRef.current);
                simulationLoopRef.current = null;
                // Avoid logging stop if it wasn't running
                // addLog("Simulation stopped.", 'info');
            }
             isTicking = false; // Reset lock on cleanup
        };
    }, [isMounted, state.isRunning, addLog, executeDecision]); // Dependency array


  const updateSimulationSettings = useCallback((newSettings: Partial<AppState['simulation']>) => {
    setState(prev => ({
      ...prev,
      simulation: { ...prev.simulation, ...newSettings },
    }));
    addLog(`Simulation settings updated: ${JSON.stringify(newSettings)}`, 'info');
  }, [addLog]);

  const toggleSimulation = useCallback(() => {
     setState(prev => ({ ...prev, isRunning: !prev.isRunning }));
     // Log is handled by the loop effect based on the new isRunning state
  }, []);


  const pauseSimulation = useCallback(() => {
     if (stateRef.current.isRunning) { // Use ref to check current status
        setState(prev => ({ ...prev, isRunning: false }));
         // Log is handled by the loop effect cleanup/next check
     }
  }, []); // No dependencies needed as it uses ref

  const resetSimulation = useCallback(() => {
     pauseSimulation(); // Ensure simulation is paused before resetting
     const freshState = createInitialState();
    setState(freshState);
    if (typeof window !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
     addLog("Simulation reset to initial state.", 'warning');
  }, [addLog, pauseSimulation]);

  const addAvatar = useCallback(() => {
     setState(prev => {
         if (prev.avatars.length >= 10) { // Example limit
             addLog("Cannot add more avatars (limit reached).", 'warning');
             return prev;
         }
         const newIndex = prev.avatars.length;
         const newAvatar: AvatarState = {
           id: generateId('avatar'),
           position: { x: Math.random() * prev.simulation.boardSize.width, y: Math.random() * prev.simulation.boardSize.height },
           orientation: Math.random() * 360,
           settings: { ...INITIAL_AVATAR_SETTINGS, apiKey: '' },
           color: generateColor(newIndex),
           nextDecisionTime: 0, // Initialize decision time
         };
         addLog(`Avatar ${newAvatar.id} added.`, 'info');
         return { ...prev, avatars: [...prev.avatars, newAvatar] };
     });
  }, [addLog]); // Removed state.avatars dependency, access length via prev

  const removeAvatar = useCallback((avatarId: string) => {
    setState(prev => {
      if (prev.avatars.length <= 2) {
           addLog(`Cannot remove avatar ${avatarId}, minimum of 2 required.`, 'warning');
           return prev;
      }
       addLog(`Avatar ${avatarId} removed.`, 'info');
       // End any active conversations involving the removed avatar
        const nextConversations = prev.conversations.map(c => {
            if (c.participants.includes(avatarId) && !c.endTime) {
                addLog(`Ending conversation ${c.id} due to avatar ${avatarId} removal.`, 'info');
                return { ...c, endTime: Date.now() };
            }
            return c;
        });
        // Reset conversation state for partners of the removed avatar
        const partnersToReset = prev.conversations
            .filter(c => c.participants.includes(avatarId) && !c.endTime) // Find active convos
            .flatMap(c => c.participants.filter(p => p !== avatarId)); // Get the other participant

        const nextAvatars = prev.avatars
             .filter(a => a.id !== avatarId)
             .map(a => partnersToReset.includes(a.id) ? { ...a, conversationTarget: undefined, currentAction: undefined } : a); // Reset partner state


      return {
        ...prev,
        avatars: nextAvatars,
        conversations: nextConversations,
      };
    });
  }, [addLog]);

  const updateAvatar = useCallback((avatarId: string, updates: Partial<AvatarState> | ((prev: AvatarState) => Partial<AvatarState>)) => {
      setState(prev => ({
          ...prev,
          avatars: prev.avatars.map(a =>
              a.id === avatarId ? { ...a, ...(typeof updates === 'function' ? updates(a) : updates) } : a
          ),
      }));
       // Avoid logging potentially large state updates directly
       // addLog(`Avatar ${avatarId} state updated.`, 'debug', avatarId);
  }, []);

    const updateAvatarSettings = useCallback((avatarId: string, settingUpdates: Partial<AvatarSettings>) => {
        updateAvatar(avatarId, (prevAvatar) => ({
            settings: {
                 ...prevAvatar.settings,
                 ...settingUpdates,
                 // Ensure eyesight angle remains 180 if updated
                 eyesight: settingUpdates.eyesight ? { ...prevAvatar.settings.eyesight, ...settingUpdates.eyesight, angle: 180 } : prevAvatar.settings.eyesight,
            }
        }));
         addLog(`Avatar ${avatarId} settings updated: ${JSON.stringify(Object.keys(settingUpdates))}`, 'info', avatarId);
    }, [updateAvatar, addLog]);


  const addObstacle = useCallback((position: Vector2, size: Vector2 = { x: 20, y: 20 }) => {
    const newObstacle: Obstacle = {
      id: generateId('obstacle'),
      position,
      size,
      type: 'obstacle',
    };
    setState(prev => ({ ...prev, obstacles: [...prev.obstacles, newObstacle] }));
     addLog(`Obstacle ${newObstacle.id} added at (${position.x.toFixed(0)}, ${position.y.toFixed(0)}).`, 'info');
  }, [addLog]);

  const removeObstacle = useCallback((obstacleId: string) => {
    setState(prev => ({ ...prev, obstacles: prev.obstacles.filter(o => o.id !== obstacleId) }));
     addLog(`Obstacle ${obstacleId} removed.`, 'info');
  }, [addLog]);


  const addObject = useCallback((position: Vector2) => {
    const newObject: ArenaObject = {
      id: generateId('object'),
      position,
      description: 'A new object', // Default description
      type: 'object',
    };
    setState(prev => ({ ...prev, objects: [...prev.objects, newObject] }));
     addLog(`Object ${newObject.id} added at (${position.x.toFixed(0)}, ${position.y.toFixed(0)}).`, 'info');
  }, [addLog]);

   const updateObjectDescription = useCallback((objectId: string, description: string) => {
    setState(prev => ({
        ...prev,
        objects: prev.objects.map(o => o.id === objectId ? { ...o, description: description || 'An object' } : o)
    }));
     addLog(`Object ${objectId} description updated.`, 'info'); // Keep log concise
   }, [addLog]);

  const removeObject = useCallback((objectId: string) => {
    setState(prev => ({ ...prev, objects: prev.objects.filter(o => o.id !== objectId) }));
    addLog(`Object ${objectId} removed.`, 'info');
  }, [addLog]);

  const resizeBoard = useCallback((newSize: { width: number; height: number }) => {
    setState(prev => {
        const clampedWidth = Math.max(100, newSize.width); // Min size 100x100
        const clampedHeight = Math.max(100, newSize.height);
        const finalSize = { width: clampedWidth, height: clampedHeight };

        return {
          ...prev,
          simulation: { ...prev.simulation, boardSize: finalSize },
          // Adjust entity positions to stay within new bounds
          avatars: prev.avatars.map(a => ({
            ...a,
            position: {
              x: Math.min(Math.max(a.position.x, 0 + 8), finalSize.width - 8), // Keep avatar center within bounds slightly inset
              y: Math.min(Math.max(a.position.y, 0 + 8), finalSize.height - 8),
            }
          })),
           objects: prev.objects.map(o => ({
            ...o,
            position: {
              x: Math.min(Math.max(o.position.x, 0 + 5), finalSize.width - 5),
              y: Math.min(Math.max(o.position.y, 0 + 5), finalSize.height - 5),
            }
          })),
           obstacles: prev.obstacles.map(ob => ({
            ...ob,
            position: {
              // Clamp position so the obstacle starts within bounds
              x: Math.min(Math.max(ob.position.x, 0), finalSize.width - ob.size.x),
              y: Math.min(Math.max(ob.position.y, 0), finalSize.height - ob.size.y),
            },
            // Optionally resize obstacles that are too large? For now, just clamp position.
           })).filter(ob => ob.position.x < finalSize.width && ob.position.y < finalSize.height), // Remove obstacles completely outside
        };
    });
     addLog(`Board resized to ${newSize.width}x${newSize.height}. Entities adjusted.`, 'info');
  }, [addLog]);


  return {
    state, // Return current state directly
    isReady: isMounted,
    addLog, // Expose logging function
    updateSimulationSettings,
    toggleSimulation,
    pauseSimulation,
    resetSimulation,
    addAvatar,
    removeAvatar,
    updateAvatar,
    updateAvatarSettings,
    addObstacle,
    removeObstacle,
    addObject,
    removeObject,
    updateObjectDescription,
    resizeBoard,
    setDefaultSystemPrompt: (avatarId: string) => updateAvatarSettings(avatarId, { systemPrompt: DEFAULT_SYSTEM_PROMPT }),
  };
}
