
'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Trash2, Save, RotateCcw } from 'lucide-react';
import type { AvatarState, AvatarSettings, LLMProvider } from '@/types';
import { llmProvidersConfig } from '@/config/llmProviders';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"; // Import Tooltip

interface AvatarSettingsPanelProps {
  avatar: AvatarState;
  onUpdateSettings: (avatarId: string, updates: Partial<AvatarSettings>) => void;
  onRemoveAvatar: (avatarId: string) => void;
  onSetDefaultPrompt: (avatarId: string) => void;
  avatarIndex: number; // Keep index for display name if needed
}

export function AvatarSettingsPanel({
  avatar,
  onUpdateSettings,
  onRemoveAvatar,
  onSetDefaultPrompt,
  avatarIndex,
}: AvatarSettingsPanelProps) {
  // Use a stable ID derived from the avatar's actual ID for form elements
  const stableIdPrefix = `avatar-${avatar.id}`;

  const [settings, setSettings] = useState<AvatarSettings>(avatar.settings);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    setSettings(avatar.settings);
    const providerModels = llmProvidersConfig[avatar.settings.provider]?.models || [];
    setAvailableModels(providerModels);
    // Ensure the current model is valid for the provider
    if (!providerModels.includes(avatar.settings.model) && providerModels.length > 0) {
       // If current model is invalid, default to the first available one
        handleSettingChange('model', providerModels[0]);
    } else if (providerModels.length === 0 && avatar.settings.model !== '') {
        // If provider has no models, clear the model setting
         handleSettingChange('model', '');
    }
  }, [avatar]); // Depend on the entire avatar object


  const handleProviderChange = (value: string) => {
    const newProvider = value as LLMProvider;
    const newModels = llmProvidersConfig[newProvider]?.models || [];
    setAvailableModels(newModels);
    const newModel = newModels.includes(settings.model) ? settings.model : (newModels[0] || '');
    setSettings(prev => ({
        ...prev,
        provider: newProvider,
        model: newModel,
        // Optionally clear API key on provider change? Or keep it? Decide based on UX.
        // apiKey: '',
    }));
  };

  const handleSettingChange = (key: keyof AvatarSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

   const handleEyesightChange = (key: 'radius' | 'angle', value: number) => {
      setSettings(prev => ({
          ...prev,
          eyesight: {
              ...prev.eyesight,
              [key]: value
          }
      }));
   };

  const handleSave = () => {
    onUpdateSettings(avatar.id, settings);
  };

  const handleResetPrompt = () => {
    onSetDefaultPrompt(avatar.id);
    // The parent state update will eventually trigger a re-render here via useEffect
  }

  return (
    <Card className="w-full" id={`${stableIdPrefix}-card`}>
      <CardHeader>
        <div className="flex justify-between items-start">
             <div>
                 <CardTitle className="text-lg flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: avatar.color }}></span>
                    Avatar Settings
                 </CardTitle>
                <CardDescription>Configure LLM and simulation parameters for Avatar {avatarIndex + 1}</CardDescription>
            </div>
             <Button onClick={() => onRemoveAvatar(avatar.id)} variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        {/* LLM Provider and Model */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${stableIdPrefix}-provider`}>LLM Provider</Label>
            <Select value={settings.provider} onValueChange={handleProviderChange}>
              <SelectTrigger id={`${stableIdPrefix}-provider`}>
                <SelectValue placeholder="Select Provider" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(llmProvidersConfig).map(provider => (
                  <SelectItem key={provider} value={provider}>
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${stableIdPrefix}-model`}>Model</Label>
            <Select
              value={settings.model}
              onValueChange={(value) => handleSettingChange('model', value)}
              disabled={availableModels.length === 0}
            >
              <SelectTrigger id={`${stableIdPrefix}-model`}>
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.length > 0 ? (
                  availableModels.map(model => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="" disabled>No models available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-2">
           <Label htmlFor={`${stableIdPrefix}-apiKey`}>API Key ({settings.provider})</Label>
          <Input
            id={`${stableIdPrefix}-apiKey`}
            type="password"
            value={settings.apiKey}
            onChange={(e) => handleSettingChange('apiKey', e.target.value)}
            placeholder="Enter API Key"
          />
           <p className="text-xs text-muted-foreground">API keys are saved locally in your browser.</p>
        </div>

        {/* Rate Limit */}
        <div className="space-y-2">
          <Label htmlFor={`${stableIdPrefix}-rateLimit`}>Rate Limit (ms/decision)</Label>
          <Input
            id={`${stableIdPrefix}-rateLimit`}
            type="number"
            min="100" // Minimum time between decisions
            step="100"
            value={settings.rateLimit} // Assuming rateLimit is now ms per decision
            onChange={(e) => handleSettingChange('rateLimit', parseInt(e.target.value, 10) || 1000)}
             placeholder="e.g., 1000"
          />
           <p className="text-xs text-muted-foreground">Time in milliseconds before the avatar makes its next decision.</p>
        </div>

        {/* Eyesight */}
         <div className="space-y-4">
             <Label>Eyesight</Label>
             <div className="grid gap-2">
                 <div className="flex justify-between items-center">
                     <Label htmlFor={`${stableIdPrefix}-eyesight-radius`} className="text-sm">Radius</Label>
                     <span className="text-sm text-muted-foreground">{settings.eyesight.radius}px</span>
                 </div>
                 <Slider
                     id={`${stableIdPrefix}-eyesight-radius`}
                     min={10}
                     max={500} // Adjust max as needed based on board size
                     step={5}
                     value={[settings.eyesight.radius]}
                     onValueChange={(value) => handleEyesightChange('radius', value[0])}
                 />
             </div>
              {/* Angle is fixed at 180 for now */}
             {/* <div className="grid gap-2">
                 <Label htmlFor={`${stableIdPrefix}-eyesight-angle`}>Angle</Label>
                 <Slider
                     id={`${stableIdPrefix}-eyesight-angle`}
                     min={10}
                     max={360}
                     step={10}
                     value={[settings.eyesight.angle]}
                     onValueChange={(value) => handleEyesightChange('angle', value[0])}
                 />
                 <span>{settings.eyesight.angle}°</span>
             </div> */}
         </div>

        {/* System Prompt */}
        <div className="space-y-2">
             <div className="flex justify-between items-center">
                <Label htmlFor={`${stableIdPrefix}-systemPrompt`}>System Prompt</Label>
                 <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleResetPrompt}>
                            <RotateCcw className="mr-1 h-3 w-3" /> Reset
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Reset to default system prompt</p>
                    </TooltipContent>
                 </Tooltip>
             </div>
          <Textarea
            id={`${stableIdPrefix}-systemPrompt`}
            value={settings.systemPrompt}
            onChange={(e) => handleSettingChange('systemPrompt', e.target.value)}
            placeholder="Define the avatar's core behavior and personality..."
            className="h-32" // Adjust height as needed
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" /> Save Settings
        </Button>
      </CardFooter>
    </Card>
  );
}
