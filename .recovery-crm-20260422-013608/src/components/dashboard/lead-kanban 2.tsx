"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Phone, Clock, AlertTriangle, User } from "lucide-react"
import { toast } from "sonner"
import { assignLeadToAgent, updateLeadStatus } from "@/lib/actions/crm-core"
import { cn } from "@/lib/utils"
import type { Lead, LeadStatus } from "@/types/leads"
import { STATUS_CONFIG, PIPELINE_STATUSES } from "@/types/leads"
import { format, isToday, isPast } from "date-fns"
import { useRouter } from "next/navigation"

// Dnd-kit imports
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  defaultDropAnimationSideEffects,
  closestCenter,
  useDroppable,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface LeadKanbanProps {
  leads: Lead[]
  currentUserId: string
}

// Column descriptions that actually explain what each stage means
const COLUMN_META: Record<LeadStatus, { description: string }> = {
  new: { description: "Unclaimed — claim to start working" },
  claimed: { description: "Assigned but not yet contacted" },
  follow_up_1: { description: "First contact made" },
  follow_up_2: { description: "Second touch underway" },
  follow_up_3: { description: "Third touch — warming up" },
  follow_up_4: { description: "Fourth touch — high intent" },
  final_call: { description: "Decision time — close or drop" },
  won: { description: "Successfully converted" },
  dropped: { description: "Lead has been dropped" },
  handed_off: { description: "Handed off to finance" },
  archived: { description: "Archived" },
}

function getFollowUpUrgency(dueAt: string | null): "overdue" | "today" | "upcoming" | null {
  if (!dueAt) return null
  const date = new Date(dueAt)
  if (isPast(date) && !isToday(date)) return "overdue"
  if (isToday(date)) return "today"
  return "upcoming"
}

/**
 * Kanban Card Component (Draggable)
 */
const KanbanCard = React.memo(({
  lead,
  currentUserId,
  mounted,
  isOverlay = false,
}: {
  lead: Lead
  currentUserId: string
  mounted: boolean
  isOverlay?: boolean
}) => {
  const router = useRouter()
  const [isClaiming, setIsClaiming] = React.useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
    data: { type: "lead", lead },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || undefined,
    zIndex: isDragging ? 50 : undefined,
    touchAction: "none",
    willChange: "transform",
  }

  // Placeholder slot while dragging
  if (isDragging && !isOverlay) {
    const config = STATUS_CONFIG[lead.crm_status]
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "h-[108px] rounded-xl border-2 border-dashed transition-colors",
          config.border,
          config.bg,
          "opacity-40"
        )}
      />
    )
  }

  const urgency = getFollowUpUrgency(lead.next_follow_up_at)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("group outline-none", isOverlay && "z-50")}
    >
      <div
        className={cn(
          "relative cursor-grab active:cursor-grabbing rounded-xl border bg-card",
          "transition-all duration-200 shadow-sm",
          "hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5",
          isOverlay
            ? "shadow-2xl border-primary/20 scale-[1.02] cursor-grabbing"
            : "border-border/40"
        )}
        onClick={() => {
          if (isDragging) return;
          router.push(`/dashboard/leads/${lead.id}`);
        }}
      >
        <div className="p-3 space-y-2">
          {/* Header: Name + Source */}
          <div className="flex items-start justify-between gap-2 min-w-0">
            <h4 className="text-[11px] font-bold text-foreground truncate tracking-tight group-hover:text-primary transition-colors leading-none pt-0.5">
              {lead.name || "Unnamed Lead"}
            </h4>
            {lead.source && (
              <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-tighter shrink-0">
                {lead.source.split(" ")[0]}
              </span>
            )}
          </div>

          {/* Body: Trip + Urgency */}
          <div className="space-y-1.5">
            {lead.trip_slug && (
              <p className="text-[10px] text-muted-foreground/60 font-bold truncate uppercase tracking-tight">
                {lead.trip_slug.replace(/-/g, " ")}
              </p>
            )}

            {mounted && lead.next_follow_up_at && (
              <div
                className={cn(
                  "flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest",
                  urgency === "overdue"
                    ? "text-rose-500"
                    : urgency === "today"
                    ? "text-amber-500"
                    : "text-muted-foreground/30"
                )}
              >
                {urgency === "overdue" ? (
                  <AlertTriangle className="size-2.5 shrink-0" />
                ) : (
                  <Clock className="size-2.5 shrink-0" />
                )}
                <span>
                  {urgency === "overdue"
                    ? "Overdue"
                    : urgency === "today"
                    ? "Today"
                    : format(new Date(lead.next_follow_up_at), "dd MMM")}
                </span>
              </div>
            )}
          </div>

          {/* Footer: Owner + Quick Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="size-4 rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-border/50">
                <User className="size-2 text-muted-foreground/60" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter text-muted-foreground/60 truncate">
                {lead.owner_name?.split(" ")[0] || "Unassigned"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              {lead.phone && !isOverlay && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    window.location.href = `tel:${lead.phone}`
                  }}
                  className="size-6 rounded-lg bg-primary/5 hover:bg-primary hover:text-primary-foreground flex items-center justify-center text-primary transition-all shadow-sm"
                >
                  <Phone className="size-2.5" />
                </button>
              )}

              {!lead.allotted_to && !isOverlay && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 px-2 text-[9px] font-bold uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90 rounded-lg shadow-lg"
                  disabled={isClaiming}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setIsClaiming(true);
                    try {
                      await assignLeadToAgent({ leadId: lead.id, agentId: currentUserId });
                      toast.success("Lead claimed successfully");
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "Failed to claim";
                      toast.error(message);
                      setIsClaiming(false);
                    }
                  }}
                >
                  Claim
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

KanbanCard.displayName = "KanbanCard"

/**
 * Kanban Column — uses useDroppable (not useSortable) since columns are containers
 */
const KanbanColumn = React.memo(({
  status,
  leads,
  currentUserId,
  mounted,
}: {
  status: LeadStatus
  leads: Lead[]
  currentUserId: string
  mounted: boolean
}) => {
  const config = STATUS_CONFIG[status]
  const meta = COLUMN_META[status]

  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: "column", status },
  })

  const leadIds = React.useMemo(() => leads.map((l) => l.id), [leads])

  return (
    <div className="flex flex-col w-[320px] shrink-0 h-full max-h-full">
      {/* Column header */}
      <div className="flex flex-col gap-0.5 px-3 py-3 bg-background/60 backdrop-blur-sm sticky top-0 z-10 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className={cn("size-2 rounded-full ring-2 ring-offset-1 ring-offset-background shadow-sm", config.dot)} />
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/80">
            {config.label}
          </h3>
          <span className="text-[9px] font-bold text-muted-foreground/40 font-mono ml-auto">
            {leads.length}
          </span>
        </div>
        <p className="text-[9px] text-muted-foreground/50 font-medium pl-4">
          {meta.description}
        </p>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2.5 transition-colors duration-150 min-h-[100px] scrollbar-hide",
          isOver && "bg-primary/[0.03]"
        )}
      >
        <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              currentUserId={currentUserId}
              mounted={mounted}
            />
          ))}

          {leads.length === 0 && (
            <div className="flex flex-col items-center justify-center h-24 border border-dashed border-border/30 rounded-xl gap-1">
              <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/30">
                {status === "new" ? "No new leads" : "Empty"}
              </span>
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
})

KanbanColumn.displayName = "KanbanColumn"

export function LeadKanban({ leads: initialLeads, currentUserId }: LeadKanbanProps) {
  const [mounted, setMounted] = React.useState(false)

  const [leadsMap, setLeadsMap] = React.useState<Record<string, Lead[]>>(() => {
    const map: Record<string, Lead[]> = {}
    PIPELINE_STATUSES.forEach((s) => (map[s] = []))
    initialLeads.forEach((l) => {
      const status = PIPELINE_STATUSES.includes(l.crm_status) ? l.crm_status : "new"
      map[status].push(l)
    })
    return map
  })

  const [activeLead, setActiveLead] = React.useState<Lead | null>(null)
  const prevLeadsRef = React.useRef(initialLeads)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Sync when external leads data changes (e.g. realtime update)
  React.useEffect(() => {
    if (prevLeadsRef.current === initialLeads) return
    const map: Record<string, Lead[]> = {}
    PIPELINE_STATUSES.forEach((s) => (map[s] = []))
    initialLeads.forEach((l) => {
      const status = PIPELINE_STATUSES.includes(l.crm_status) ? l.crm_status : "new"
      map[status].push(l)
    })
    setLeadsMap(map)
    prevLeadsRef.current = initialLeads
  }, [initialLeads])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  )

  const findContainer = React.useCallback(
    (id: string): LeadStatus | null => {
      // Check if id IS a column
      if (PIPELINE_STATUSES.includes(id as LeadStatus)) {
        return id as LeadStatus
      }
      // Otherwise find which column contains this lead id
      for (const status of PIPELINE_STATUSES) {
        if (leadsMap[status]?.some((l) => l.id === id)) {
          return status as LeadStatus
        }
      }
      return null
    },
    [leadsMap]
  )

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const { active } = event
      const activeId = active.id as string
      let foundLead: Lead | null = null
      Object.values(leadsMap).forEach((list) => {
        const match = list.find((l) => l.id === activeId)
        if (match) foundLead = match
      })
      if (foundLead) setActiveLead(foundLead)
    },
    [leadsMap]
  )

  const handleDragOver = React.useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) return

      const activeId = active.id as string
      const overId = over.id as string

      const activeContainer = findContainer(activeId)
      const overContainer = findContainer(overId)

      if (!activeContainer || !overContainer) return
      if (activeContainer === overContainer) return

      setLeadsMap((prev) => {
        const activeItems = prev[activeContainer] ?? []
        const overItems = prev[overContainer] ?? []

        const activeIndex = activeItems.findIndex((i) => i.id === activeId)
        if (activeIndex === -1) return prev

        const item = activeItems[activeIndex]
        const updatedItem: Lead = {
          ...item,
          crm_status: overContainer,
        }

        const newActiveItems = activeItems.filter((i) => i.id !== activeId)

        // Insert before the over item if over is a card, otherwise append
        const overIndex = overItems.findIndex((i) => i.id === overId)
        const insertAt = overIndex >= 0 ? overIndex : overItems.length

        const newOverItems = [...overItems]
        newOverItems.splice(insertAt, 0, updatedItem)

        return {
          ...prev,
          [activeContainer]: newActiveItems,
          [overContainer]: newOverItems,
        }
      })
    },
    [findContainer]
  )

  const handleDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveLead(null)

      if (!over) return

      const activeId = active.id as string
      const overId = over.id as string

      const activeContainer = findContainer(activeId)
      const overContainer = findContainer(overId)

      if (!activeContainer || !overContainer) return

      if (activeContainer === overContainer) {
        // Reorder within column
        setLeadsMap((prev) => {
          const items = prev[activeContainer] ?? []
          const oldIndex = items.findIndex((i) => i.id === activeId)
          const newIndex = items.findIndex((i) => i.id === overId)
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev
          return {
            ...prev,
            [activeContainer]: arrayMove(items, oldIndex, newIndex),
          }
        })
        return
      }

      // Cross-column drop — persist to DB
      const originalStatus = initialLeads.find((l) => l.id === activeId)?.crm_status
      if (originalStatus !== overContainer) {
        try {
          const result = await updateLeadStatus(activeId, overContainer)
          toast.success(`Moved to ${STATUS_CONFIG[overContainer].label}`)
          if (result?.follow_up_missing) {
            toast.warning("Lead moved. Follow-up date/time is missing, please schedule it from lead profile.")
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          toast.error(`Failed to save: ${message}`)
          // Revert optimistic update
          setLeadsMap(() => {
            const map: Record<string, Lead[]> = {}
            PIPELINE_STATUSES.forEach((s) => (map[s] = []))
            initialLeads.forEach((l) => {
              const s = PIPELINE_STATUSES.includes(l.crm_status) ? l.crm_status : "new"
              map[s].push(l)
            })
            return map
          })
        }
      }
    },
    [findContainer, initialLeads]
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 p-4 h-full min-h-0 overflow-x-auto overscroll-x-contain scrollbar-hide select-none">
        {PIPELINE_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            leads={leadsMap[status] ?? []}
            currentUserId={currentUserId}
            mounted={mounted}
          />
        ))}
      </div>

      <DragOverlay
        dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: { opacity: "0.35" },
            },
          }),
        }}
      >
        {activeLead ? (
          <KanbanCard
            lead={activeLead}
            currentUserId={currentUserId}
            mounted={mounted}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
