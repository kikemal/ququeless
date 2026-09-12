import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BRANDING_THEMES,
  PUBLIC_DESCRIPTION_MAX,
  PUBLIC_INSTRUCTIONS_MAX,
  isBrandingTheme,
  mapPublicBusinessProfile,
  validateBusinessSettings,
} from "../../lib/business/settings.ts";

describe("validateBusinessSettings", () => {
  const base = {
    name: "Acme Dental",
    publicDescription: "",
    publicInstructions: "",
    contactEmail: "",
    contactPhone: "",
    brandingTheme: "default",
  };

  it("accepts a valid name and default theme", () => {
    const result = validateBusinessSettings(base);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.name, "Acme Dental");
      assert.equal(result.value.brandingTheme, "default");
      assert.equal(result.value.publicDescription, null);
      assert.equal(result.value.contactEmail, null);
    }
  });

  it("rejects empty business name", () => {
    const result = validateBusinessSettings({ ...base, name: "   " });
    assert.equal(result.ok, false);
  });

  it("rejects overlong description", () => {
    const result = validateBusinessSettings({
      ...base,
      publicDescription: "x".repeat(PUBLIC_DESCRIPTION_MAX + 1),
    });
    assert.equal(result.ok, false);
  });

  it("rejects overlong instructions", () => {
    const result = validateBusinessSettings({
      ...base,
      publicInstructions: "y".repeat(PUBLIC_INSTRUCTIONS_MAX + 1),
    });
    assert.equal(result.ok, false);
  });

  it("normalizes email and trims optional fields", () => {
    const result = validateBusinessSettings({
      ...base,
      name: "  Clinic  ",
      publicDescription: "  Walk-in desk.  ",
      contactEmail: "  Info@Example.COM ",
      contactPhone: " +1 555 0100 ",
      brandingTheme: "warm",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.name, "Clinic");
      assert.equal(result.value.publicDescription, "Walk-in desk.");
      assert.equal(result.value.contactEmail, "info@example.com");
      assert.equal(result.value.contactPhone, "+1 555 0100");
      assert.equal(result.value.brandingTheme, "warm");
    }
  });

  it("rejects invalid email", () => {
    const result = validateBusinessSettings({
      ...base,
      contactEmail: "not-an-email",
    });
    assert.equal(result.ok, false);
  });

  it("accepts every whitelisted theme", () => {
    for (const theme of BRANDING_THEMES) {
      const result = validateBusinessSettings({
        ...base,
        brandingTheme: theme,
      });
      assert.equal(result.ok, true);
    }
  });

  it("rejects arbitrary theme strings", () => {
    const result = validateBusinessSettings({
      ...base,
      brandingTheme: "<script>alert(1)</script>",
    });
    assert.equal(result.ok, false);
    assert.equal(isBrandingTheme("neon-glow"), false);
  });
});

describe("mapPublicBusinessProfile", () => {
  it("maps only allowlisted public fields and defaults unknown themes", () => {
    const profile = mapPublicBusinessProfile({
      business_name: "Acme",
      business_slug: "acme",
      public_description: "Hello",
      public_instructions: "Arrive soon",
      contact_email: "hello@acme.test",
      contact_phone: "+15550100",
      branding_theme: "not-a-theme",
    });

    assert.deepEqual(Object.keys(profile).sort(), [
      "brandingTheme",
      "businessName",
      "businessSlug",
      "contactEmail",
      "contactPhone",
      "publicDescription",
      "publicInstructions",
    ]);
    assert.equal(profile.brandingTheme, "default");
    assert.equal(profile.businessSlug, "acme");
    assert.equal(
      "ownerId" in profile || "id" in profile || "email" in profile,
      false,
    );
  });
});
