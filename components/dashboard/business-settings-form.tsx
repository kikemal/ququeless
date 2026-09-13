"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  updateBusinessSettingsAction,
  type SettingsActionState,
} from "@/app/(app)/dashboard/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUSINESS_TIMEZONES,
  WEEKDAY_LABELS,
  type DayScheduleInput,
  type Weekday,
} from "@/lib/business/hours";
import {
  BRANDING_THEMES,
  BUSINESS_NAME_MAX,
  CONTACT_PHONE_MAX,
  PUBLIC_DESCRIPTION_MAX,
  PUBLIC_INSTRUCTIONS_MAX,
  brandingThemeLabel,
  type BrandingTheme,
} from "@/lib/business/settings";
import { cn } from "@/lib/utils";

export type BusinessSettingsFormValues = {
  name: string;
  slug: string;
  publicDescription: string;
  publicInstructions: string;
  contactEmail: string;
  contactPhone: string;
  brandingTheme: BrandingTheme;
  timezone: string;
  schedule: DayScheduleInput[];
};

type BusinessSettingsFormProps = {
  initial: BusinessSettingsFormValues;
};

const initialState: SettingsActionState = {};

function DayRow({
  formId,
  day,
  pending,
}: {
  formId: string;
  day: DayScheduleInput;
  pending: boolean;
}) {
  const [closed, setClosed] = useState(day.isClosed);
  const label =
    WEEKDAY_LABELS.find((item) => item.weekday === day.weekday)?.label ??
    `Day ${day.weekday}`;

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-surface px-3 py-3 sm:grid-cols-[7rem_auto_1fr_1fr] sm:items-center">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name={`day_${day.weekday}_closed`}
          value="true"
          checked={closed}
          disabled={pending}
          onChange={(event) => setClosed(event.target.checked)}
        />
        Closed
      </label>
      <div className="space-y-1">
        <Label htmlFor={`${formId}-open-${day.weekday}`} className="text-xs">
          Start
        </Label>
        <Input
          id={`${formId}-open-${day.weekday}`}
          name={`day_${day.weekday}_open`}
          type="time"
          defaultValue={day.openTime}
          disabled={closed || pending}
          required={!closed}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${formId}-close-${day.weekday}`} className="text-xs">
          End
        </Label>
        <Input
          id={`${formId}-close-${day.weekday}`}
          name={`day_${day.weekday}_close`}
          type="time"
          defaultValue={day.closeTime}
          disabled={closed || pending}
          required={!closed}
        />
      </div>
    </div>
  );
}

export function BusinessSettingsForm({ initial }: BusinessSettingsFormProps) {
  const router = useRouter();
  const formId = useId();
  const [state, formAction, pending] = useActionState(
    updateBusinessSettingsAction,
    initialState,
  );
  const successRef = useRef(false);
  const timezoneOptions =
    BUSINESS_TIMEZONES.includes(initial.timezone as (typeof BUSINESS_TIMEZONES)[number])
      ? BUSINESS_TIMEZONES
      : ([initial.timezone, ...BUSINESS_TIMEZONES] as readonly string[]);

  useEffect(() => {
    if (state.success && !successRef.current) {
      successRef.current = true;
      router.refresh();
    }
    if (!state.success) {
      successRef.current = false;
    }
  }, [state.success, router]);

  const schedule = [...initial.schedule].sort(
    (a, b) => a.weekday - b.weekday,
  ) as DayScheduleInput[];

  return (
    <form action={formAction} className="mx-auto max-w-2xl space-y-8">
      {state.error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state.message && !state.error ? (
        <p
          className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent"
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Business profile
          </h2>
          <p className="mt-1 text-sm text-muted">
            Name appears on your public queue page. Changing it does not change
            your public link.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Business name</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            required
            maxLength={BUSINESS_NAME_MAX}
            defaultValue={initial.name}
            autoComplete="organization"
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-slug`}>Public slug</Label>
          <Input
            id={`${formId}-slug`}
            value={initial.slug}
            readOnly
            disabled
            aria-describedby={`${formId}-slug-help`}
          />
          <p id={`${formId}-slug-help`} className="text-xs text-muted">
            Your public URL stays /q/{initial.slug}. Slug edits are not available
            in this phase.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-description`}>Public description</Label>
          <textarea
            id={`${formId}-description`}
            name="publicDescription"
            maxLength={PUBLIC_DESCRIPTION_MAX}
            rows={3}
            defaultValue={initial.publicDescription}
            placeholder="Short description customers see on your queue page"
            disabled={pending}
            className={cn(
              "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground",
              "placeholder:text-muted/80 disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30",
            )}
          />
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Hours & timezone
          </h2>
          <p className="mt-1 text-sm text-muted">
            Customers can join only while the business is open in this timezone.
            Queue open/paused/closed stays separate.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-timezone`}>Business timezone</Label>
          <select
            id={`${formId}-timezone`}
            name="timezone"
            defaultValue={initial.timezone}
            disabled={pending}
            className={cn(
              "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30",
            )}
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Weekly schedule</p>
          <div className="space-y-2">
            {schedule.map((day) => (
              <DayRow key={day.weekday} formId={formId} day={day} pending={pending} />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Public queue
          </h2>
          <p className="mt-1 text-sm text-muted">
            Optional instructions and a controlled presentation theme.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-instructions`}>Customer instructions</Label>
          <textarea
            id={`${formId}-instructions`}
            name="publicInstructions"
            maxLength={PUBLIC_INSTRUCTIONS_MAX}
            rows={4}
            defaultValue={initial.publicInstructions}
            placeholder="e.g. Please arrive within 10 minutes when called."
            disabled={pending}
            className={cn(
              "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground",
              "placeholder:text-muted/80 whitespace-pre-wrap disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30",
            )}
          />
        </div>

        <fieldset className="space-y-3" disabled={pending}>
          <legend className="text-sm font-medium text-foreground">Theme</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {BRANDING_THEMES.map((theme) => (
              <label
                key={theme}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              >
                <input
                  type="radio"
                  name="brandingTheme"
                  value={theme}
                  defaultChecked={initial.brandingTheme === theme}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-foreground">
                    {brandingThemeLabel(theme)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Contact information
          </h2>
          <p className="mt-1 text-sm text-muted">
            Shown on the public queue page only when set. Not used for login or
            notifications.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-email`}>Public email</Label>
          <Input
            id={`${formId}-email`}
            name="contactEmail"
            type="email"
            autoComplete="email"
            defaultValue={initial.contactEmail}
            placeholder="Optional"
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-phone`}>Public phone</Label>
          <Input
            id={`${formId}-phone`}
            name="contactPhone"
            type="tel"
            maxLength={CONTACT_PHONE_MAX}
            autoComplete="tel"
            defaultValue={initial.contactPhone}
            placeholder="Optional"
            disabled={pending}
          />
        </div>
      </section>

      <div className="border-t border-border pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export type { Weekday };
