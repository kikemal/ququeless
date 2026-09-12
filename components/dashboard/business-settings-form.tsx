"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  updateBusinessSettingsAction,
  type SettingsActionState,
} from "@/app/(app)/dashboard/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
};

type BusinessSettingsFormProps = {
  initial: BusinessSettingsFormValues;
};

const initialState: SettingsActionState = {};

export function BusinessSettingsForm({ initial }: BusinessSettingsFormProps) {
  const router = useRouter();
  const formId = useId();
  const [state, formAction, pending] = useActionState(
    updateBusinessSettingsAction,
    initialState,
  );
  const successRef = useRef(false);

  useEffect(() => {
    if (state.success && !successRef.current) {
      successRef.current = true;
      router.refresh();
    }
    if (!state.success) {
      successRef.current = false;
    }
  }, [state.success, router]);

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
            className={cn(
              "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground",
              "placeholder:text-muted/80",
              "focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30",
            )}
          />
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
            className={cn(
              "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground",
              "placeholder:text-muted/80 whitespace-pre-wrap",
              "focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30",
            )}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground">Theme</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {BRANDING_THEMES.map((theme) => (
              <label
                key={theme}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40"
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
