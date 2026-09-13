"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import {
  createQueueAction,
  deleteQueueAction,
  updateQueueAction,
  type QueueActionState,
} from "@/app/(app)/dashboard/queues/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  QUEUE_STATUSES,
  queueStatusLabel,
  type QueueStatus,
} from "@/lib/dashboard/queue-status";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

export type QueueListItem = Tables<"queues"> & {
  services: Pick<Tables<"services">, "id" | "name" | "is_active"> | null;
};

export type ServiceOption = Pick<
  Tables<"services">,
  "id" | "name" | "is_active"
>;

type QueuesManagerProps = {
  queues: QueueListItem[];
  services: ServiceOption[];
};

const initialState: QueueActionState = {};

export function QueuesManager({ queues, services }: QueuesManagerProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<QueueActionState>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<QueueListItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeServices = services.filter((service) => service.is_active);
  const canCreate = activeServices.length > 0;

  function refreshAfter(result: QueueActionState) {
    setBanner(result);
    if (result.success) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Queues
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
            Create queues for your active services and manage their status.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!canCreate}
          title={
            canCreate
              ? undefined
              : "Add an active service before creating a queue."
          }
        >
          Create queue
        </Button>
      </div>

      {!canCreate ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          You need at least one active service before you can create a queue.{" "}
          <Link
            href="/dashboard/services"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Manage services
          </Link>
        </p>
      ) : null}

      {banner.error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {banner.error}
        </p>
      ) : null}
      {banner.message && !banner.error ? (
        <p
          className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent"
          role="status"
        >
          {banner.message}
        </p>
      ) : null}

      {queues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <h2 className="font-display text-xl font-semibold text-foreground">
            No queues yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Create a queue for an active service to start organizing wait times.
          </p>
          <div className="mt-6">
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={!canCreate}
            >
              Create queue
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-background/70 text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Queue</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Current #</th>
                <th className="px-4 py-3 font-medium">Capacity</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue) => {
                const busy = isPending && pendingId === queue.id;
                return (
                  <tr key={queue.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-4 align-top">
                      <Link
                        href={`/dashboard/queues/${queue.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {queue.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {queue.services?.name ?? "Unknown service"}
                      {queue.services && !queue.services.is_active ? (
                        <span className="mt-1 block text-xs text-muted">
                          Service inactive
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge status={queue.status} />
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {queue.current_number}
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {queue.max_waiting_customers == null
                        ? "Unlimited"
                        : queue.max_waiting_customers}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          href={`/dashboard/queues/${queue.id}`}
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                        >
                          Open
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                          disabled={busy}
                          onClick={() => setEditing(queue)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 px-3 text-xs text-danger"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Delete queue “${queue.name}”? Customer ticket history for this queue will also be removed.`,
                              )
                            ) {
                              return;
                            }
                            const formData = new FormData();
                            formData.set("queueId", queue.id);
                            setPendingId(queue.id);
                            startTransition(async () => {
                              const result = await deleteQueueAction(formData);
                              setPendingId(null);
                              refreshAfter(result);
                            });
                          }}
                        >
                          {busy ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <QueueFormDialog
          title="Create queue"
          submitLabel="Create queue"
          action={createQueueAction}
          services={activeServices}
          onClose={() => setCreateOpen(false)}
          onSuccess={(result) => {
            setCreateOpen(false);
            refreshAfter(result);
          }}
        />
      ) : null}

      {editing ? (
        <QueueFormDialog
          title="Edit queue"
          submitLabel="Save changes"
          action={updateQueueAction}
          queue={editing}
          services={servicesForEdit(services, editing.service_id)}
          onClose={() => setEditing(null)}
          onSuccess={(result) => {
            setEditing(null);
            refreshAfter(result);
          }}
        />
      ) : null}
    </div>
  );
}

function servicesForEdit(services: ServiceOption[], currentServiceId: string) {
  return services.filter(
    (service) => service.is_active || service.id === currentServiceId,
  );
}

export function StatusBadge({ status }: { status: QueueStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-1 text-xs font-medium capitalize",
        status === "open" && "bg-accent-soft text-accent",
        status === "paused" && "bg-background text-foreground",
        status === "closed" && "bg-background text-muted",
      )}
    >
      {queueStatusLabel(status)}
    </span>
  );
}

type QueueFormDialogProps = {
  title: string;
  submitLabel: string;
  action: (
    prev: QueueActionState,
    formData: FormData,
  ) => Promise<QueueActionState>;
  services: ServiceOption[];
  queue?: QueueListItem;
  onClose: () => void;
  onSuccess: (result: QueueActionState) => void;
};

function QueueFormDialog({
  title,
  submitLabel,
  action,
  services,
  queue,
  onClose,
  onSuccess,
}: QueueFormDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: QueueActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.success) {
        onSuccess(result);
      }
      return result;
    },
    initialState,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  useEffect(() => {
    const root = dialogRef.current;
    if (!root) {
      return;
    }
    const focusable = root.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])",
    );
    focusable?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(100dvh-2rem,40rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-xl font-semibold text-foreground">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-background"
            onClick={onClose}
            disabled={pending}
          >
            Close
          </button>
        </div>

        <form action={formAction} className="mt-5 space-y-4" noValidate>
          {queue ? <input type="hidden" name="queueId" value={queue.id} /> : null}

          {state.error ? (
            <p
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}

          <div>
            <Label htmlFor="queue-name">Queue name</Label>
            <Input
              id="queue-name"
              name="name"
              required
              disabled={pending}
              defaultValue={queue?.name ?? ""}
              placeholder="Front desk"
            />
          </div>

          <div>
            <Label htmlFor="queue-service">Service</Label>
            <select
              id="queue-service"
              name="serviceId"
              required
              disabled={pending || services.length === 0}
              defaultValue={queue?.service_id ?? ""}
              className="h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground transition-colors hover:border-foreground/20 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-70"
            >
              <option value="" disabled>
                Select a service
              </option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                  {service.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="queue-status">Status</Label>
            <select
              id="queue-status"
              name="status"
              required
              disabled={pending}
              defaultValue={queue?.status ?? "open"}
              className="h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground transition-colors hover:border-foreground/20 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-70"
            >
              {QUEUE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {queueStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="queue-capacity">
              Max waiting customers{" "}
              <span className="font-normal text-muted">(optional)</span>
            </Label>
            <Input
              id="queue-capacity"
              name="maxWaitingCustomers"
              type="number"
              min={1}
              max={10000}
              step={1}
              inputMode="numeric"
              disabled={pending}
              defaultValue={
                queue?.max_waiting_customers != null
                  ? String(queue.max_waiting_customers)
                  : ""
              }
              placeholder="Leave blank for unlimited"
            />
            <p className="mt-1 text-xs text-muted">
              Limits how many customers can wait at once. Leave blank for
              unlimited.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || services.length === 0}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
