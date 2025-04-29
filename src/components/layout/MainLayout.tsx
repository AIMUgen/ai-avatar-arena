'use client';

import React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"; // Assuming path is correct
import { Button } from "@/components/ui/button";
import { Bot, Settings, PlusCircle } from 'lucide-react'; // Example icons

interface MainLayoutProps {
  children: React.ReactNode;
  sidebarContent: React.ReactNode;
  onAddAvatar: () => void;
}

export function MainLayout({ children, sidebarContent, onAddAvatar }: MainLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="icon"> {/* Use icon collapse for desktop */}
        <SidebarHeader className="flex items-center justify-between">
           <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">AI Arena</span>
           </div>
           {/* Trigger might be better placed in the header of the main content */}
        </SidebarHeader>
        <SidebarContent className="p-0">
             {/* Avatar List / Settings will go here */}
             {sidebarContent}
        </SidebarContent>
        <SidebarFooter className="p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
           <Button
                variant="ghost"
                className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:p-0"
                onClick={onAddAvatar}
                aria-label="Add Avatar"
           >
             <PlusCircle className="mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0" />
             <span className="group-data-[collapsible=icon]:hidden">Add Avatar</span>
           </Button>
        </SidebarFooter>
      </Sidebar>

      {/* Main content area */}
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4">
             <SidebarTrigger className="md:hidden" /> {/* Only show trigger on mobile */}
             <h1 className="text-xl font-semibold">AI Avatar Arena</h1>
             {/* Add other header elements if needed */}
        </header>
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
