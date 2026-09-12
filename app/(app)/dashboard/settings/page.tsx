import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  BusinessSettingsForm,
  type BusinessSettingsFormValues,
} from "@/components/dashboard/business-settings-form";
import {
  getPrimaryBusiness,
  getPrimaryMembership,
} from "@/lib/auth/business";
import {
  defaultWeeklySchedule,
  normalizeTimeHhMm,
  type DayScheduleInput,
  type Weekday,
} from "@/lib/business/hours";
import {
  isBrandingTheme,
  type BrandingTheme,
} from "@/lib/business/settings";
import { requireAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
};

function toFormValues(
  business: NonNullable<Awaited<ReturnType<typeof getPrimaryBusiness>>>,
  schedule: DayScheduleInput[],
): BusinessSettingsFormValues {
  const theme: BrandingTheme = isBrandingTheme(business.branding_theme)
    ? business.branding_theme
    : "default";

  return {
    name: business.name,
    slug: business.slug,
    publicDescription: business.public_description ?? "",
    publicInstructions: business.public_instructions ?? "",
    contactEmail: business.contact_email ?? "",
    contactPhone: business.contact_phone ?? "",
    brandingTheme: theme,
    timezone: business.timezone || "UTC",
    schedule,
  };
}

export default async function SettingsPage() {
  const user = await requireAuthUser();
  const membership = await getPrimaryMembership(user.id);
  const business = await getPrimaryBusiness(user.id);

  if (!membership || !business) {
    redirect("/onboarding");
  }

  if (membership.role !== "business_owner") {
    return (
      <main>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p
          className="mt-4 max-w-xl rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted"
          role="status"
        >
          Only the business owner can change business settings, timezone, and
          operating hours. You can still manage queues and services from the
          dashboard.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: hoursRows, error: hoursError } = await supabase
    .from("business_operating_hours")
    .select("weekday, is_closed, open_time, close_time")
    .eq("business_id", business.id)
    .order("weekday", { ascending: true });

  if (hoursError) {
    console.error("SettingsPage hours error", hoursError.code);
  }

  const schedule: DayScheduleInput[] =
    hoursRows && hoursRows.length === 7
      ? hoursRows.map((row) => ({
          weekday: row.weekday as Weekday,
          isClosed: row.is_closed,
          openTime: normalizeTimeHhMm(row.open_time ?? "") ?? "09:00",
          closeTime: normalizeTimeHhMm(row.close_time ?? "") ?? "17:00",
        }))
      : defaultWeeklySchedule();

  return (
    <main>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
        Business settings
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        Update your public profile, operating hours, customer instructions, and
        queue page theme.
      </p>
      <div className="mt-8">
        <BusinessSettingsForm initial={toFormValues(business, schedule)} />
      </div>
    </main>
  );
}
