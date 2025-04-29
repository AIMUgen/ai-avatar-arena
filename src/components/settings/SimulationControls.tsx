'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Play, Pause, RotateCcw, Settings, Maximize, Minimize } from 'lucide-react';
import type { SimulationMode, SimulationSettings } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SimulationControlsProps {
  isRunning: boolean;
  settings: SimulationSettings;
  onToggle: () => void;
  onReset: () => void;
  onUpdateSettings: (newSettings: Partial<SimulationSettings>) => void;
  onResizeBoard: (newSize: { width: number; height: number }) => void;
}

export function SimulationControls({
  isRunning,
  settings,
  onToggle,
  onReset,
  onUpdateSettings,
  onResizeBoard,
}: SimulationControlsProps) {
  const [tempWidth, setTempWidth] = useState(settings.boardSize.width.toString());
  const [tempHeight, setTempHeight] = useState(settings.boardSize.height.toString());

  const handleModeChange = (value: string) => {
    onUpdateSettings({ mode: value as SimulationMode });
  };

  const handleResizeApply = () => {
      const width = parseInt(tempWidth, 10);
      const height = parseInt(tempHeight, 10);
      if (!isNaN(width) && width > 0 && !isNaN(height) && height > 0) {
          onResizeBoard({ width, height });
      } else {
          // Reset temp values if input is invalid
          setTempWidth(settings.boardSize.width.toString());
          setTempHeight(settings.boardSize.height.toString());
      }
  };

   React.useEffect(() => {
      setTempWidth(settings.boardSize.width.toString());
      setTempHeight(settings.boardSize.height.toString());
    }, [settings.boardSize]);

  return (
    <Card className="w-full">
       <CardHeader>
            <CardTitle className="text-lg">Simulation Controls</CardTitle>
       </CardHeader>
       <CardContent className="flex flex-wrap items-center gap-4">
         <Button onClick={onToggle} variant="outline" size="icon" aria-label={isRunning ? "Pause Simulation" : "Run Simulation"}>
           {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
         </Button>
         <Button onClick={onReset} variant="outline" size="icon" aria-label="Reset Simulation">
           <RotateCcw className="h-4 w-4" />
         </Button>

         <div className="flex items-center gap-2">
             <Label htmlFor="sim-mode" className="text-sm">Mode:</Label>
             <Select value={settings.mode} onValueChange={handleModeChange}>
               <SelectTrigger id="sim-mode" className="w-[180px]">
                 <SelectValue placeholder="Select mode" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="turn-based">Turn-Based</SelectItem>
                 <SelectItem value="time-based">Time-Based</SelectItem>
               </SelectContent>
             </Select>
          </div>

          <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                        <Maximize className="mr-2 h-4 w-4" /> Board Size
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                    <div className="grid gap-4">
                        <div className="space-y-2">
                            <h4 className="font-medium leading-none">Resize Board</h4>
                            <p className="text-sm text-muted-foreground">
                                Set the dimensions of the simulation area.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 items-center gap-4">
                            <Label htmlFor="width">Width</Label>
                            <Input
                                id="width"
                                type="number"
                                value={tempWidth}
                                onChange={(e) => setTempWidth(e.target.value)}
                                className="col-span-1 h-8"
                                min="100" // Example minimum
                            />
                             <Label htmlFor="height">Height</Label>
                            <Input
                                id="height"
                                type="number"
                                value={tempHeight}
                                onChange={(e) => setTempHeight(e.target.value)}
                                className="col-span-1 h-8"
                                min="100" // Example minimum
                            />
                        </div>
                         <Button onClick={handleResizeApply} size="sm">Apply Size</Button>
                    </div>
                </PopoverContent>
            </Popover>

          {/* TODO: Add controls for turnDuration or timeScale based on mode */}
           {settings.mode === 'turn-based' && (
                <div className="flex items-center gap-2">
                    <Label htmlFor="turn-duration" className="text-sm">Turn (ms):</Label>
                    <Input
                        id="turn-duration"
                        type="number"
                        value={settings.turnDuration ?? 1000}
                        onChange={(e) => onUpdateSettings({ turnDuration: parseInt(e.target.value, 10) || 1000 })}
                        className="w-20 h-8"
                        min="100"
                    />
                </div>
            )}
             {settings.mode === 'time-based' && (
                 <div className="flex items-center gap-2">
                    <Label htmlFor="time-scale" className="text-sm">Speed:</Label>
                    <Input
                        id="time-scale"
                        type="number"
                        step="0.1"
                        value={settings.timeScale ?? 1}
                        onChange={(e) => onUpdateSettings({ timeScale: parseFloat(e.target.value) || 1 })}
                        className="w-20 h-8"
                         min="0.1"
                    />
                </div>
            )}
       </CardContent>
    </Card>
  );
}
