'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import type { AppState, ArenaEntity, Vector2, AvatarState, ArenaObject, Obstacle, Eyesight } from '@/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ArenaVisualizerProps {
  appState: AppState;
  onObjectClick: (objectId: string, currentDescription: string) => void;
  onBackgroundClick: (position: Vector2) => void; // For adding objects/obstacles
  selectedTool: 'select' | 'add_object' | 'add_obstacle';
  onEntitySelect: (entity: ArenaEntity | null) => void;
  selectedEntityId?: string | null;
}

// Constants for drawing
const AVATAR_RADIUS = 8;
const OBJECT_RADIUS = 5;
const OBSTACLE_COLOR = 'hsl(var(--muted-foreground))';
const EYESIGHT_COLOR = 'rgba(0, 188, 212, 0.1)'; // Teal with transparency
const EYESIGHT_BORDER_COLOR = 'rgba(0, 188, 212, 0.3)';
const SELECTION_COLOR = 'hsl(var(--accent))'; // Teal for selection outline


export function ArenaVisualizer({
  appState,
  onObjectClick,
  onBackgroundClick,
  selectedTool,
  onEntitySelect,
  selectedEntityId,
}: ArenaVisualizerProps) {
  const canvasRef = useRef<SVGSVGElement>(null);

  const getEntityAtPosition = (clickPos: Vector2): ArenaEntity | null => {
      // Check avatars first (smaller target)
      for (const avatar of appState.avatars) {
          const dx = clickPos.x - avatar.position.x;
          const dy = clickPos.y - avatar.position.y;
          if (dx * dx + dy * dy <= AVATAR_RADIUS * AVATAR_RADIUS) {
              return avatar;
          }
      }
      // Check objects
      for (const obj of appState.objects) {
           const dx = clickPos.x - obj.position.x;
           const dy = clickPos.y - obj.position.y;
           if (dx * dx + dy * dy <= OBJECT_RADIUS * OBJECT_RADIUS) {
               return obj;
           }
       }
       // Check obstacles
      for (const obs of appState.obstacles) {
          if (
              clickPos.x >= obs.position.x &&
              clickPos.x <= obs.position.x + obs.size.x &&
              clickPos.y >= obs.position.y &&
              clickPos.y <= obs.position.y + obs.size.y
          ) {
              return obs;
          }
      }
      return null;
  }

  const handleCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!canvasRef.current) return;

    const svg = canvasRef.current;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    const clickPos = { x: svgP.x, y: svgP.y };

    const clickedEntity = getEntityAtPosition(clickPos);

    if (selectedTool === 'add_object') {
      onBackgroundClick(clickPos);
      onEntitySelect(null); // Deselect after adding
    } else if (selectedTool === 'add_obstacle') {
      onBackgroundClick(clickPos);
      onEntitySelect(null); // Deselect after adding
    } else { // Select tool
        if (clickedEntity) {
            if (clickedEntity.type === 'object') {
                 onObjectClick(clickedEntity.id, clickedEntity.description);
            }
            onEntitySelect(clickedEntity);
        } else {
            onEntitySelect(null); // Clicked on background
        }
    }
  };


  const drawEyesight = (avatar: AvatarState) => {
    const { position, orientation, settings: { eyesight } } = avatar;
    const { radius, angle } = eyesight;
    const startAngleRad = (orientation - angle / 2) * (Math.PI / 180);
    const endAngleRad = (orientation + angle / 2) * (Math.PI / 180);

    const startX = position.x + radius * Math.cos(startAngleRad);
    const startY = position.y + radius * Math.sin(startAngleRad);
    const endX = position.x + radius * Math.cos(endAngleRad);
    const endY = position.y + radius * Math.sin(endAngleRad);

    // Large arc flag: 1 if angle > 180, 0 otherwise. For 180 it doesn't matter much.
    const largeArcFlag = angle <= 180 ? "0" : "1";

    const pathData = [
      `M ${position.x} ${position.y}`, // Move to center
      `L ${startX} ${startY}`,          // Line to start of arc
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`, // Arc to end point
      `Z`                               // Close path back to center
    ].join(" ");

    return (
       <path
            key={`${avatar.id}-eyesight`}
            d={pathData}
            fill={EYESIGHT_COLOR}
            stroke={EYESIGHT_BORDER_COLOR}
            strokeWidth="1"
        />
    );
  };

  const drawOrientationIndicator = (avatar: AvatarState) => {
      const { position, orientation } = avatar;
      const angleRad = orientation * (Math.PI / 180);
      const lineLength = AVATAR_RADIUS * 1.5; // Make indicator slightly longer than radius
      const endX = position.x + lineLength * Math.cos(angleRad);
      const endY = position.y + lineLength * Math.sin(angleRad);

      return (
          <line
              key={`${avatar.id}-orientation`}
              x1={position.x}
              y1={position.y}
              x2={endX}
              y2={endY}
              stroke={avatar.color} // Use avatar color or a contrast color
              strokeWidth="1.5"
              markerEnd="url(#arrowhead)" // Optional: Add an arrowhead
          />
      );
  };

  return (
     <TooltipProvider>
      <div className="w-full h-full border rounded-md overflow-hidden bg-card">
         <svg
            ref={canvasRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${appState.simulation.boardSize.width} ${appState.simulation.boardSize.height}`}
            onClick={handleCanvasClick}
            style={{ cursor: selectedTool === 'select' ? 'default' : 'crosshair' }}
            className="bg-background"
         >
           {/* Definitions for arrowhead marker */}
           <defs>
               <marker
                   id="arrowhead"
                   markerWidth="5"
                   markerHeight="3.5"
                   refX="0"
                   refY="1.75" // Center the arrowhead vertically on the line
                   orient="auto">
                   <polygon points="0 0, 5 1.75, 0 3.5" fill="currentColor" />
               </marker>
           </defs>

            {/* Draw Eyesight (render first so other elements are on top) */}
            {appState.avatars.map(drawEyesight)}

            {/* Draw Obstacles */}
            {appState.obstacles.map((obstacle) => (
              <rect
                key={obstacle.id}
                x={obstacle.position.x}
                y={obstacle.position.y}
                width={obstacle.size.x}
                height={obstacle.size.y}
                fill={OBSTACLE_COLOR}
                stroke={selectedEntityId === obstacle.id ? SELECTION_COLOR : OBSTACLE_COLOR}
                strokeWidth={selectedEntityId === obstacle.id ? 2 : 1}
              />
            ))}

            {/* Draw Objects */}
            {appState.objects.map((object) => (
                <Tooltip key={object.id}>
                   <TooltipTrigger asChild>
                        <circle
                          cx={object.position.x}
                          cy={object.position.y}
                          r={OBJECT_RADIUS}
                          fill="hsl(var(--secondary-foreground))" // Use a neutral color
                          stroke={selectedEntityId === object.id ? SELECTION_COLOR : 'hsl(var(--secondary-foreground))'}
                          strokeWidth={selectedEntityId === object.id ? 2 : 1}
                          className="cursor-pointer"
                        />
                   </TooltipTrigger>
                   <TooltipContent>
                       <p>{object.description}</p>
                   </TooltipContent>
                </Tooltip>
            ))}

             {/* Draw Avatars */}
            {appState.avatars.map((avatar) => (
              <g key={avatar.id}>
                 <Tooltip>
                      <TooltipTrigger asChild>
                            <circle
                              cx={avatar.position.x}
                              cy={avatar.position.y}
                              r={AVATAR_RADIUS}
                              fill={avatar.color}
                              stroke={selectedEntityId === avatar.id ? SELECTION_COLOR : avatar.color}
                              strokeWidth={selectedEntityId === avatar.id ? 2 : 1}
                              className="cursor-pointer"
                            />
                       </TooltipTrigger>
                       <TooltipContent>
                           <p>Avatar ID: {avatar.id}</p>
                           <p>Position: ({avatar.position.x.toFixed(0)}, {avatar.position.y.toFixed(0)})</p>
                           <p>Orientation: {avatar.orientation.toFixed(0)}°</p>
                           {avatar.currentAction && <p>Action: {avatar.currentAction}</p>}
                           {avatar.conversationTarget && <p>Talking to: {avatar.conversationTarget}</p>}
                           {avatar.thought && <p>Thought: {avatar.thought}</p>}
                       </TooltipContent>
                    </Tooltip>
                 {/* Draw Orientation Indicator */}
                 {drawOrientationIndicator(avatar)}
              </g>
            ))}

         </svg>
      </div>
     </TooltipProvider>
  );
}

interface ObjectEditPopoverProps {
    object: ArenaObject;
    onDescriptionChange: (objectId: string, description: string) => void;
    onDelete: (objectId: string) => void;
    children: React.ReactNode; // The trigger element
}

export function ObjectEditPopover({ object, onDescriptionChange, onDelete, children }: ObjectEditPopoverProps) {
    const [description, setDescription] = React.useState(object.description);

    const handleSave = () => {
        onDescriptionChange(object.id, description);
        // Consider closing popover here if needed, depends on ShadCN behavior
    };

     // Update local state if the object prop changes externally
    React.useEffect(() => {
        setDescription(object.description);
    }, [object.description]);


    return (
        <Popover>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Edit Object Note</h4>
                        <p className="text-sm text-muted-foreground">
                            Set a custom description for this object.
                        </p>
                    </div>
                    <div className="grid gap-2">
                         <Textarea
                           id="description"
                           value={description}
                           onChange={(e) => setDescription(e.target.value)}
                           placeholder="An object"
                           className="h-20"
                         />
                     </div>
                    <div className="flex justify-between">
                         <Button variant="outline" size="sm" onClick={handleSave}>Save</Button>
                         <Button variant="destructive" size="sm" onClick={() => onDelete(object.id)}>Delete Object</Button>
                     </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
