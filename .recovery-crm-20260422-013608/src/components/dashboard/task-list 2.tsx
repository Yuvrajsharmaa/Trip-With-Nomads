"use client";

import { 
  Plus,
  Check
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TASKS = [
  {
    id: "1",
    title: "Follow up with Acme Inc.",
    description: "Send proposal and schedule meeting",
    due: "Due Today",
    priority: "High",
    completed: false
  },
  {
    id: "2",
    title: "Prepare quarterly report",
    description: "Compile sales data and forecasts",
    due: "Due Tomorrow",
    priority: "Medium",
    completed: false
  },
  {
    id: "3",
    title: "Update customer profiles",
    description: "Verify contact information and preferences",
    due: "Due Oct 15",
    priority: "Low",
    completed: true
  }
];

export function TaskList() {
  return (
    <Card className="border-border/60 shadow-none h-full bg-card rounded-2xl flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg font-bold font-heading mb-1">Tasks</CardTitle>
          <CardDescription className="text-xs font-sans text-muted-foreground">Track and manage your upcoming tasks.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="h-8 font-sans font-medium text-xs">
          <Plus className="mr-2 h-3.5 w-3.5" /> Add Task
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {TASKS.map((task) => (
          <div key={task.id} className="flex p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
            <div className="mr-3 mt-1 cursor-pointer">
              <div className={`size-4 rounded border flex items-center justify-center transition-colors ${task.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:border-primary/50'}`}>
                {task.completed && <Check className="size-3" />}
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
               <span className={`text-sm font-black font-heading tracking-tight ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</span>
               <span className={`text-xs font-sans font-bold ${task.completed ? 'line-through text-muted-foreground/60' : 'text-muted-foreground'}`}>{task.description}</span>
               
               <div className="flex items-center gap-3 mt-1.5">
                  <Badge variant="outline" className={`h-5 text-[9px] font-black uppercase tracking-tight px-2 
                    ${task.priority === 'High' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 
                      task.priority === 'Medium' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                      'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                    {task.priority}
                  </Badge>
                  <span className="text-[10px] font-bold text-muted-foreground/80 lowercase tracking-widest">{task.due}</span>
               </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
