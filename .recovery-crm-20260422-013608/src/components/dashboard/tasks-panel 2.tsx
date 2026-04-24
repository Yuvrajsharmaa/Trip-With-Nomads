"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Link2,
  Calendar as CalendarIcon,
  ArrowUpRight,
  ListFilter,
} from "lucide-react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import type { AssignableAgent } from "@/types/crm-core";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type { UnifiedTaskItem } from "@/types/dashboard";
import { createTask, deleteTask, updateTask } from "@/lib/actions/tasks";
import { completeDueTask } from "@/lib/actions/crm-core";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
  low: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
};

interface TasksPanelProps {
  initialTasks: UnifiedTaskItem[];
  counts: { total: number; todo: number; in_progress: number; done: number };
  agents: AssignableAgent[];
  leads: { id: string; name: string }[];
  currentUserId: string;
}

function formatDueLabel(value: string) {
  const date = new Date(value);
  if (isToday(date)) return { label: "Today", tone: "text-amber-600 dark:text-amber-400" };
  if (isTomorrow(date)) return { label: "Tomorrow", tone: "text-foreground" };
  if (isPast(date)) return { label: `Overdue · ${format(date, "MMM d")}`, tone: "text-destructive" };
  return { label: format(date, "dd MMM yyyy"), tone: "text-muted-foreground" };
}

function AddTaskDialog({
  open,
  onOpenChange,
  onCreated,
  agents,
  leads,
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onCreated: (task: UnifiedTaskItem) => void;
  agents: AssignableAgent[];
  leads: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>("medium");
  const [status, setStatus] = React.useState<TaskStatus>("todo");
  const [assignedTo, setAssignedTo] = React.useState(currentUserId);
  const [leadId, setLeadId] = React.useState<string>("");
  const [dueDate, setDueDate] = React.useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setStatus("todo");
    setAssignedTo(currentUserId);
    setLeadId("");
    setDueDate(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) reset();
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) {
              toast.error("Task title is required");
              return;
            }

            startTransition(async () => {
              try {
                await createTask({
                  title: title.trim(),
                  description: description.trim() || undefined,
                  priority,
                  status,
                  due_at: dueDate ? dueDate.toISOString() : null,
                  lead_id: leadId || null,
                  assigned_to: assignedTo || null,
                });

                const lead = leads.find((item) => item.id === leadId);
                const assignee = agents.find((item) => item.id === assignedTo);

                onCreated({
                  id: crypto.randomUUID(),
                  source: "crm_task",
                  title: title.trim(),
                  description: description.trim() || null,
                  priority,
                  status,
                  due_at: dueDate ? dueDate.toISOString() : new Date().toISOString(),
                  pending_minutes: 0,
                  urgency_score: 0,
                  lead_id: leadId || null,
                  lead_name: lead?.name ?? null,
                  lead_phone: null,
                  lead_trip_slug: null,
                  lead_status: null,
                  assigned_to: assignedTo || null,
                  assignee_name: assignee?.full_name ?? null,
                  created_by: currentUserId,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });

                toast.success("Task created");
                onOpenChange(false);
                reset();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create task");
              }
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Call and close follow-up"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Input
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional context"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">Todo</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={assignedTo || "unassigned"} onValueChange={(value) => setAssignedTo(value === "unassigned" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Linked lead</Label>
              <Select value={leadId || "none"} onValueChange={(value) => setLeadId(value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>{lead.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start", !dueDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 size-4" />
                  {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={(date) => {
                    setDueDate(date);
                    setCalendarOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !title.trim()}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TasksPanel({ initialTasks, counts: initialCounts, agents, leads, currentUserId }: TasksPanelProps) {
  const router = useRouter();
  const [tasks, setTasks] = React.useState<UnifiedTaskItem[]>(initialTasks);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = React.useState<TaskPriority | "all">("all");
  const [sourceFilter, setSourceFilter] = React.useState<"all" | UnifiedTaskItem["source"]>("all");
  const [viewFilter, setViewFilter] = React.useState<"active" | "completed" | "all">("active");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Set<string>>(new Set());
  const [confirmTask, setConfirmTask] = React.useState<UnifiedTaskItem | null>(null);

  const liveCounts = React.useMemo(() => {
    const total = tasks.length;
    const todo = tasks.filter((task) => task.status === "todo").length;
    const inProgress = tasks.filter((task) => task.status === "in_progress").length;
    const done = tasks.filter((task) => task.status === "done").length;
    return { total, todo, in_progress: inProgress, done };
  }, [tasks]);

  const counts = tasks.length > 0 ? liveCounts : initialCounts;

  const filteredTasks = React.useMemo(() => {
    return tasks.filter((task) => {
      if (viewFilter === "active" && task.status === "done") return false;
      if (viewFilter === "completed" && task.status !== "done") return false;
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (sourceFilter !== "all" && task.source !== sourceFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(q) ||
        task.lead_name?.toLowerCase().includes(q) ||
        task.assignee_name?.toLowerCase().includes(q)
      );
    });
  }, [tasks, viewFilter, statusFilter, priorityFilter, sourceFilter, searchQuery]);

  const allSelected = filteredTasks.length > 0 && filteredTasks.every((task) => selectedIds.has(task.id));

  const markDone = React.useCallback((task: UnifiedTaskItem) => {
    if (pendingTaskIds.has(task.id) || task.status === "done") return;
    const previousStatus = task.status;

    setPendingTaskIds((prev) => new Set(prev).add(task.id));

    void (async () => {
      try {
        if (task.source === "crm_task") {
          await updateTask({ taskId: task.id, updates: { status: "done" } });
        } else if (task.lead_id) {
          await completeDueTask({ leadId: task.lead_id });
        }

        setTasks((previous) => previous.map((item) => {
          if (item.id !== task.id) return item;
          return { ...item, status: "done" };
        }));

        if (task.source === "crm_task") {
          toast.success("Task updated", {
            action: {
              label: "Undo",
              onClick: () => {
                void updateTask({ taskId: task.id, updates: { status: previousStatus } });
                setTasks((previous) =>
                  previous.map((item) => (item.id === task.id ? { ...item, status: previousStatus } : item))
                );
              },
            },
          });
        } else {
          toast.success("Task updated");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update task");
      } finally {
        setPendingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    })();
  }, [pendingTaskIds]);

  const removeTask = React.useCallback((task: UnifiedTaskItem) => {
    if (task.source !== "crm_task") {
      toast.error("Follow-up items cannot be deleted from this table");
      return;
    }

    if (pendingTaskIds.has(task.id)) return;

    setPendingTaskIds((prev) => new Set(prev).add(task.id));

    void (async () => {
      try {
        await deleteTask(task.id);
        setTasks((previous) => previous.filter((item) => item.id !== task.id));
        toast.success("Task deleted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete task");
      } finally {
        setPendingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    })();
  }, [pendingTaskIds]);

  return (
    <div className="w-full space-y-5 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Tasks Workspace</h1>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Manage owner tasks and lead follow-ups from one shared queue.
          </p>
        </div>
        <Button className="h-9 gap-2 px-4 text-xs font-semibold" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          New Task
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Tasks</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{counts.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">To Do</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-muted-foreground">{counts.todo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">In Progress</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-primary">{counts.in_progress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Completed</p>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{counts.done}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search tasks, leads, or assignees..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TaskStatus | "all")}> 
              <SelectTrigger className="h-10 w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="todo">Todo</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as TaskPriority | "all")}> 
              <SelectTrigger className="h-10 w-[150px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as "all" | UnifiedTaskItem["source"])}> 
              <SelectTrigger className="h-10 w-[170px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="crm_task">CRM Tasks</SelectItem>
                <SelectItem value="lead_follow_up">Lead Follow-ups</SelectItem>
              </SelectContent>
            </Select>

            <Select value={viewFilter} onValueChange={(value) => setViewFilter(value as "active" | "completed" | "all")}>
              <SelectTrigger className="h-10 w-[140px]">
                <SelectValue placeholder="View" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>

            {(searchQuery || statusFilter !== "all" || priorityFilter !== "all" || sourceFilter !== "all" || viewFilter !== "active") && (
              <Button
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setSearchQuery("");
                  setViewFilter("active");
                  setStatusFilter("all");
                  setPriorityFilter("all");
                  setSourceFilter("all");
                }}
              >
                <Filter className="mr-2 size-4" />
                Reset
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <ListFilter className="size-6 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">No tasks found</p>
                <p className="text-xs text-muted-foreground">
                  No items match the current filters. Create a task or adjust filters to continue.
                </p>
              </div>
              <Button size="sm" onClick={() => setAddOpen(true)}>Create Task</Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            setSelectedIds(new Set(filteredTasks.map((task) => task.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => {
                    const due = formatDueLabel(task.due_at);
                    const pending = pendingTaskIds.has(task.id);

                    return (
                      <TableRow key={task.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(task.id)}
                            onCheckedChange={(checked) => {
                              setSelectedIds((previous) => {
                                const next = new Set(previous);
                                if (checked) next.add(task.id);
                                else next.delete(task.id);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[280px]">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{task.title}</p>
                              {task.lead_id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6"
                                  onClick={() => router.push(`/dashboard/leads/${task.lead_id}`)}
                                >
                                  <ArrowUpRight className="size-3.5" />
                                </Button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {task.lead_name ? (
                                <span className="inline-flex items-center gap-1">
                                  <Link2 className="size-3" /> {task.lead_name}
                                </span>
                              ) : (
                                <span>No linked lead</span>
                              )}
                              {task.description && <span>· {task.description}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {task.status === "todo" && <Circle className="mr-1 size-3" />}
                            {task.status === "in_progress" && <CircleDot className="mr-1 size-3 text-primary" />}
                            {task.status === "done" && <CheckCircle2 className="mr-1 size-3 text-emerald-500" />}
                            {STATUS_LABELS[task.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("capitalize", PRIORITY_STYLES[task.priority])}>
                            {PRIORITY_LABELS[task.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={cn("text-xs", due.tone)}>{due.label}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{task.assignee_name || "Unassigned"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
                            {task.source === "crm_task" ? "Task" : "Follow-up"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setConfirmTask(task)} disabled={task.status === "done" || pending}>
                                Mark done
                              </DropdownMenuItem>
                              {task.source === "crm_task" && (
                                <DropdownMenuItem onClick={() => removeTask(task)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 size-3.5" /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(task) => {
          setTasks((previous) => [task, ...previous]);
        }}
        agents={agents}
        leads={leads}
        currentUserId={currentUserId}
      />
      <Dialog open={Boolean(confirmTask)} onOpenChange={(open) => !open && setConfirmTask(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Mark this item as complete?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Completed items stay visible in the Completed view so they can be reviewed later.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTask(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmTask) markDone(confirmTask);
                setConfirmTask(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
