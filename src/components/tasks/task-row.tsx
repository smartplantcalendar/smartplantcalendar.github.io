"use client";

import { Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data-provider";
import { daysUntil, isOverdue } from "@/domain/tasks";
import type { Task } from "@/domain/types";
import { formatDate, formatDays, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CropImage } from "@/components/brand/crop-image";
import { TaskTypeIcon } from "./task-type-badge";

/** One task in a list: quick complete toggle + opens details on click. */
export function TaskRow({ task, onOpen, showDate = true }: { task: Task; onOpen: (t: Task) => void; showDate?: boolean }) {
  const { updateTask, today, data } = useAppData();
  const planting = task.plantingId ? data.plantings.find((p) => p.id === task.plantingId) : undefined;
  const done = task.status === "done";
  const overdue = isOverdue(task, today);
  const diff = daysUntil(task.dueDate, today);

  return (
    <li className={cn("group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong", done && "bg-surface-muted/60")}>
      <button
        type="button"
        onClick={async () => {
          const res = await updateTask(task.id, { status: done ? "pending" : "done" });
          if (!res.ok) toast.error(res.error);
        }}
        aria-label={done ? `إلغاء إكمال: ${task.title}` : `وضع كمكتملة: ${task.title}`}
        aria-pressed={done}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done ? "border-primary bg-primary text-primary-foreground" : "border-border-strong text-transparent hover:border-primary hover:text-primary/40",
        )}
      >
        {done ? <Check className="size-4" /> : <Circle className="size-3" />}
      </button>
      <button type="button" onClick={() => onOpen(task)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        {planting ? (
          <CropImage crop={{ slug: planting.cropSlug, name: planting.cropName }} className="size-10 shrink-0 rounded-lg" sizes="40px" decorative />
        ) : null}
        <TaskTypeIcon type={task.type} className="hidden sm:flex" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-semibold", done && "text-muted-foreground line-through decoration-1")}>{task.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[planting?.cropName, showDate ? formatDate(task.dueDate, { weekday: true, year: false }) : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        {!done ? (
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", overdue ? "bg-warning-soft text-warning" : diff === 0 ? "bg-accent text-accent-foreground" : "text-subtle-foreground")}>
            {overdue ? `متأخرة ${formatDays(-diff)}` : relativeDay(diff)}
          </span>
        ) : null}
      </button>
    </li>
  );
}
