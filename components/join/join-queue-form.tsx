"use client";

import { useActionState, useEffect } from "react";

import { joinQueueAction, type JoinQueueState } from "@/app/(public)/q/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type JoinQueueFormProps = {
  queueId: string;
  queueStatus: "open" | "paused" | "closed";
};

const initialState: JoinQueueState = {};

export function JoinQueueForm({ queueId, queueStatus }: JoinQueueFormProps) {
  const [state, formAction, pending] = useActionState(joinQueueAction, initialState);

  useEffect(() => {
    if (!state.ticket) return;
    window.sessionStorage.setItem(
      `queueless-ticket:${state.ticket.publicId}`,
      state.ticket.accessToken,
    );
    window.location.assign(`/ticket/${state.ticket.publicId}`);
  }, [state.ticket]);

  const disabled = pending || queueStatus !== "open";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="queueId" value={queueId} />
      <div>
        <Label htmlFor={`customer-name-${queueId}`}>Your name</Label>
        <Input
          id={`customer-name-${queueId}`}
          name="customerName"
          placeholder="e.g. Hana"
          autoComplete="name"
          maxLength={120}
          required
          disabled={disabled}
        />
      </div>
      <div>
        <Label htmlFor={`customer-phone-${queueId}`}>
          Phone <span className="font-normal text-muted">(optional)</span>
        </Label>
        <Input
          id={`customer-phone-${queueId}`}
          name="customerPhone"
          placeholder="e.g. 09..."
          autoComplete="tel"
          maxLength={32}
          disabled={disabled}
        />
      </div>
      {state.error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={disabled}>
        {pending ? "Joining…" : queueStatus === "open" ? "Join queue" : "Not accepting joins"}
      </Button>
    </form>
  );
}
