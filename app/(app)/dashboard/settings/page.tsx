import type { Metadata } from "next";

import { getPrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireAuthUser();
  const business = await getPrimaryBusiness(user.id);

  return (
    <main>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
        Settings
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        Business settings will be editable in a later phase.
      </p>

      {business ? (
        <dl className="mt-8 max-w-lg space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted">Business name</dt>
            <dd className="mt-1 text-base text-foreground">{business.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted">Type</dt>
            <dd className="mt-1 text-base text-foreground">
              {business.business_type}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted">Public slug</dt>
            <dd className="mt-1 text-base text-foreground">{business.slug}</dd>
          </div>
        </dl>
      ) : null}
    </main>
  );
}
