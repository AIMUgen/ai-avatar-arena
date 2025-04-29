
'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ArenaVisualizer, ObjectEditPopover } from '@/components/simulation/ArenaVisualizer';
import { SimulationControls } from '@/components/settings/SimulationControls';
import { AvatarSettingsPanel } from '@/components/settings/AvatarSettingsPanel';
import { useSimulationState } from '@/hooks/useSimulationState';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Import Tooltip components
import { Hand, Square, Circle, Trash2, Loader2, Terminal } from 'lucide-react'; // Added Terminal
import type { ArenaEntity, ArenaObject, Obstacle, Vector2, SimulationLogEntry } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

// Helper function to format log messages
const formatLogMessage = (log: SimulationLogEntry): string => {
  const time = new Date(log.timestamp).toLocaleTimeString();
  let prefix = '';
  if (log.avatarId) {
      // Shorten avatar ID for display if needed
      const shortId = log.avatarId.length > 8 ? `...${log.avatarId.slice(-4)}` : log.avatarId;
      prefix = `[${shortId}] `;
  }
  return `[${time}] ${prefix}${log.message}`;
};

export default function Home() {
  const {
    state,
    isReady,
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
    setDefaultSystemPrompt,
  } = useSimulationState();

  const [selectedTool, setSelectedTool] = useState<'select' | 'add_object' | 'add_obstacle'>('select');
  const [selectedEntity, setSelectedEntity] = useState<ArenaEntity | null>(null);
  const [objectToEdit, setObjectToEdit] = useState<ArenaObject | null>(null); // For the popover
  const logScrollAreaRef = useRef<HTMLDivElement>(null);


   // Effect to clear selection if the selected entity is removed from the state
    useEffect(() => {
        if (selectedEntity && state) {
            const entityExists =
                state.avatars.some(a => a.id === selectedEntity.id) ||
                state.objects.some(o => o.id === selectedEntity.id) ||
                state.obstacles.some(ob => ob.id === selectedEntity.id);
            if (!entityExists) {
                setSelectedEntity(null);
                setObjectToEdit(null);
            }
        }
    }, [state?.avatars, state?.objects, state?.obstacles, selectedEntity]); // More specific dependencies


   const handleEntitySelect = (entity: ArenaEntity | null) => {
      setSelectedEntity(entity);
      setObjectToEdit(null); // Close edit popover when selecting something else
       // If an object is selected with the select tool, prepare it for editing
       if (entity?.type === 'object' && selectedTool === 'select') {
           setObjectToEdit(entity);
       }
   };

   const handleObjectClick = (objectId: string, currentDescription: string) => {
        if (selectedTool === 'select') {
            const object = state?.objects.find(o => o.id === objectId);
            if (object) {
                setObjectToEdit(object);
                setSelectedEntity(object); // Also mark as selected
            }
        }
   };

   const handleBackgroundClick = (position: Vector2) => {
       if (selectedTool === 'add_object') {
           addObject(position);
           setSelectedTool('select'); // Switch back to select tool after adding
       } else if (selectedTool === 'add_obstacle') {
           addObstacle(position); // Using default size for now
           setSelectedTool('select'); // Switch back to select tool after adding
       } else {
           // Deselect if clicking background with select tool
           setSelectedEntity(null);
           setObjectToEdit(null);
       }
   };

   const handleDeleteSelected = () => {
       if (!selectedEntity || !state) return;
       const entityToDelete = selectedEntity; // Capture before deselecting

       setSelectedEntity(null); // Deselect immediately for UI responsiveness
       setObjectToEdit(null);

       if (entityToDelete.type === 'avatar') {
           if (state.avatars.length > 2) { // Enforce minimum
               removeAvatar(entityToDelete.id);
           } else {
               // Optionally show a toast/message that minimum avatars are required
               console.warn("Cannot remove avatar, minimum of 2 required.");
               setSelectedEntity(entityToDelete); // Reselect if deletion failed
           }
       } else if (entityToDelete.type === 'object') {
           removeObject(entityToDelete.id);
       } else if (entityToDelete.type === 'obstacle') {
           removeObstacle(entityToDelete.id);
       }
   };

  const sidebarContent = useMemo(() => {
    // If not ready, show skeleton loaders for avatars
    if (!isReady || !state?.avatars) {
        return (
            <ScrollArea className="h-full flex-grow">
                <div className="p-4 space-y-4">
                    <h2 className="text-lg font-semibold group-data-[collapsible=icon]:hidden">Avatars</h2>
                    {[...Array(2)].map((_, index) => ( // Show 2 skeletons initially
                        <Card key={`skeleton-${index}`} className="w-full"> {/* Use unique key */}
                            <CardHeader>
                                <Skeleton className="h-6 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                            </CardHeader>
                            <CardContent className="grid gap-6">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </CardContent>
                             <CardFooter className="flex justify-end">
                                 <Skeleton className="h-10 w-24" />
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </ScrollArea>
        );
    }
    // If ready, show the actual avatar panels
    return (
        <ScrollArea className="h-full flex-grow">
            <div className="p-4 space-y-4">
                <h2 className="text-lg font-semibold group-data-[collapsible=icon]:hidden">Avatars</h2>
                {state.avatars.map((avatar, index) => (
                    <AvatarSettingsPanel
                        key={avatar.id} // Use stable avatar ID for key
                        avatar={avatar}
                        avatarIndex={index} // Pass index for display purposes
                        onUpdateSettings={updateAvatarSettings}
                        onRemoveAvatar={removeAvatar}
                        onSetDefaultPrompt={setDefaultSystemPrompt}
                    />
                ))}
            </div>
        </ScrollArea>
    );
  }, [isReady, state?.avatars, updateAvatarSettings, removeAvatar, setDefaultSystemPrompt]);


    // Wrap the ArenaVisualizer with ObjectEditPopover conditionally
    const visualizerElement = isReady && state ? (
        <ArenaVisualizer
            appState={state}
            onObjectClick={handleObjectClick}
            onBackgroundClick={handleBackgroundClick}
            selectedTool={selectedTool}
            onEntitySelect={handleEntitySelect}
            selectedEntityId={selectedEntity?.id}
        />
    ) : (
         <div className="w-full h-full border rounded-md overflow-hidden bg-card flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
         </div>
    );

    // Scroll logs to bottom when new logs arrive
    useEffect(() => {
        if (logScrollAreaRef.current) {
            logScrollAreaRef.current.scrollTop = logScrollAreaRef.current.scrollHeight;
        }
    }, [state?.simulationLogs]);


   // Loading state for the main content area
   if (!isReady) {
     return (
         <MainLayout sidebarContent={sidebarContent} onAddAvatar={() => {}}>
              <div className="flex flex-col h-full gap-4 items-center justify-center">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading Simulation...</p>
              </div>
         </MainLayout>
     );
    }

  // Render the full UI once ready
  return (
    <MainLayout sidebarContent={sidebarContent} onAddAvatar={addAvatar}>
      <TooltipProvider> {/* Wrap relevant parts or entire app with TooltipProvider */}
      <div className="flex flex-col h-full gap-4">
        {/* Top Controls */}
         <SimulationControls
            isRunning={state.isRunning}
            settings={state.simulation}
            onToggle={toggleSimulation}
            onReset={resetSimulation}
            onUpdateSettings={updateSimulationSettings}
            onResizeBoard={resizeBoard}
        />

         {/* Toolbar, Visualizer, and Log Area */}
        <div className="flex flex-1 gap-4 overflow-hidden">
           {/* Toolbar */}
          <Card className="w-20 flex-shrink-0">
             <CardHeader className="p-2">
                <CardTitle className="text-sm text-center">Tools</CardTitle>
             </CardHeader>
             <CardContent className="p-2 flex flex-col gap-2 items-center">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={selectedTool === 'select' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => setSelectedTool('select')}
                            aria-label="Select Tool"
                        >
                            <Hand className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right"><p>Select (V)</p></TooltipContent>
                 </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={selectedTool === 'add_object' ? 'secondary' : 'ghost'}
                            size="icon"
                            onClick={() => setSelectedTool('add_object')}
                             aria-label="Add Object Tool"
                       >
                           <Circle className="h-5 w-5" />
                       </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right"><p>Add Object (O)</p></TooltipContent>
                 </Tooltip>
                 <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                           variant={selectedTool === 'add_obstacle' ? 'secondary' : 'ghost'}
                           size="icon"
                           onClick={() => setSelectedTool('add_obstacle')}
                            aria-label="Add Obstacle Tool"
                        >
                            <Square className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right"><p>Add Obstacle (B)</p></TooltipContent>
                 </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant='ghost'
                            size="icon"
                            onClick={handleDeleteSelected}
                            disabled={!selectedEntity || (selectedEntity.type === 'avatar' && state.avatars.length <= 2)}
                            className="text-destructive hover:text-destructive disabled:text-muted-foreground"
                            aria-label="Delete Selected"
                        >
                            <Trash2 className="h-5 w-5" />
                        </Button>
                     </TooltipTrigger>
                     <TooltipContent side="right"><p>Delete Selected (Del)</p></TooltipContent>
                  </Tooltip>
             </CardContent>
          </Card>

           {/* Visualizer */}
           <div className="flex-grow h-full min-h-0 relative">
                {objectToEdit ? (
                    <ObjectEditPopover
                         object={objectToEdit}
                         onDescriptionChange={updateObjectDescription}
                         onDelete={(id) => { removeObject(id); setSelectedEntity(null); setObjectToEdit(null); }}
                     >
                         {/* The visualizer itself acts as the trigger area */}
                         {visualizerElement}
                     </ObjectEditPopover>
                 ) : (
                     visualizerElement
                 )}
            </div>

             {/* Simulation Log */}
             <Card className="w-80 flex-shrink-0 flex flex-col h-full">
                <CardHeader className="p-4 border-b">
                     <CardTitle className="text-base flex items-center gap-2">
                        <Terminal className="h-5 w-5" /> Simulation Log
                     </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-grow overflow-hidden">
                    <ScrollArea className="h-full p-4" ref={logScrollAreaRef}>
                        {state.simulationLogs.length > 0 ? (
                            state.simulationLogs.map((log, index) => (
                                <p key={index} className={`text-xs mb-1 ${
                                    log.level === 'error' ? 'text-destructive' :
                                    log.level === 'warning' ? 'text-yellow-600 dark:text-yellow-400' : // Adjust warning color if needed
                                    'text-muted-foreground'
                                }`}>
                                    {formatLogMessage(log)}
                                </p>
                            ))
                        ) : (
                            <p className="text-xs text-muted-foreground italic">Simulation log is empty.</p>
                        )}
                    </ScrollArea>
                </CardContent>
             </Card>
        </div>


      </div>
     </TooltipProvider>
    </MainLayout>
  );
}

