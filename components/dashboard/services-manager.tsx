"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createServiceAction,
  deleteServiceAction,
  setServiceActiveAction,
  updateServiceAction,
  type ServiceActionState,
} from "@/app/(app)/dashboard/services/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type ServiceRow = Tables<"services">;

type ServicesManagerProps = {
  services: ServiceRow[];
};

const initialState: ServiceActionState = {};

function formatCreatedAt(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ServicesManager({ services }: ServicesManagerProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<ServiceActionState>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refreshAfter(result: ServiceActionState) {
    setBanner(result);
    if (result.success) {
      router.refresh();
    }
  }

  function runRowAction(
    serviceId: string,
    action: (formData: FormData) => Promise<ServiceActionState>,
    formData: FormData,
  ) {
    setPendingId(serviceId);
    startTransition(async () => {
      const result = await action(formData);
      setPendingId(null);
      refreshAfter(result);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Services
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
            Define what customers wait for. Queues connect to these services.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Add service
        </Button>
      </div>

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

      {services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <h2 className="font-display text-xl font-semibold text-foreground">
            No services yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Add your first service to start creating queues.
          </p>
          <div className="mt-6">
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Add service
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-background/70 text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const busy = isPending && pendingId === service.id;
                return (
                  <tr key={service.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-4 align-top">
                      <p className="font-medium text-foreground">{service.name}</p>
                      {service.description ? (
                        <p className="mt-1 max-w-md text-xs text-muted">
                          {service.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top text-foreground">
                      {service.average_service_minutes} min
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-1 text-xs font-medium",
                          service.is_active
                            ? "bg-accent-soft text-accent"
                            : "bg-background text-muted",
                        )}
                      >
                        {service.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top text-muted">
                      {formatCreatedAt(service.created_at)}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                          disabled={busy}
                          onClick={() => setEditing(service)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                          disabled={busy}
                          onClick={() => {
                            const formData = new FormData();
                            formData.set("serviceId", service.id);
                            formData.set(
                              "isActive",
                              service.is_active ? "false" : "true",
                            );
                            runRowAction(
                              service.id,
                              setServiceActiveAction,
                              formData,
                            );
                          }}
                        >
                          {busy
                            ? "Saving…"
                            : service.is_active
                              ? "Deactivate"
                              : "Activate"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 px-3 text-xs text-danger"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Delete “${service.name}”? This only works if no queues use it.`,
                              )
                            ) {
                              return;
                            }
                            const formData = new FormData();
                            formData.set("serviceId", service.id);
                            runRowAction(service.id, deleteServiceAction, formData);
                          }}
                        >
                          Delete
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
        <ServiceFormDialog
          title="Add service"
          submitLabel="Create service"
          action={createServiceAction}
          onClose={() => setCreateOpen(false)}
          onSuccess={(result) => {
            setCreateOpen(false);
            refreshAfter(result);
          }}
        />
      ) : null}

      {editing ? (
        <ServiceFormDialog
          title="Edit service"
          submitLabel="Save changes"
          action={updateServiceAction}
          service={editing}
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

type ServiceFormDialogProps = {
  title: string;
  submitLabel: string;
  action: (
    prev: ServiceActionState,
    formData: FormData,
  ) => Promise<ServiceActionState>;
  service?: ServiceRow;
  onClose: () => void;
  onSuccess: (result: ServiceActionState) => void;
};

function ServiceFormDialog({
  title,
  submitLabel,
  action,
  service,
  onClose,
  onSuccess,
}: ServiceFormDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ServiceActionState, formData: FormData) => {
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
          {service ? (
            <input type="hidden" name="serviceId" value={service.id} />
          ) : null}

          {state.error ? (
            <p
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}

          <div>
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              name="name"
              required
              disabled={pending}
              defaultValue={service?.name ?? ""}
              placeholder="Haircut"
            />
          </div>

          <div>
            <Label htmlFor="service-duration">Average minutes</Label>
            <Input
              id="service-duration"
              name="averageServiceMinutes"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              disabled={pending}
              defaultValue={service?.average_service_minutes ?? 30}
            />
          </div>

          <div>
            <Label htmlFor="service-description">
              Description{" "}
              <span className="font-normal text-muted">(optional)</span>
            </Label>
            <textarea
              id="service-description"
              name="description"
              rows={3}
              disabled={pending}
              defaultValue={service?.description ?? ""}
              placeholder="Short description for your team"
              className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/80 transition-colors hover:border-foreground/20 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:bg-background disabled:opacity-70"
            />
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
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
