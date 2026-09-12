/**
 * Business timezone + weekly operating hours (Phase 13).
 * Boundary semantics (DB authoritative): open_time <= local_time < close_time
 * (open exactly at start; closed exactly at end). No overnight intervals.
 */

export const WEEKDAY_LABELS = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 7, label: "Sunday" },
] as const;

export type Weekday = (typeof WEEKDAY_LABELS)[number]["weekday"];

/** Curated IANA zones for the settings UI (DB still validates via pg_timezone_names). */
export const BUSINESS_TIMEZONES = [
  "UTC",
  "Africa/Addis_Ababa",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Pacific/Auckland",
] as const;

export type BusinessTimezone = (typeof BUSINESS_TIMEZONES)[number];

export type DayScheduleInput = {
  weekday: Weekday;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
};

export type NormalizedDaySchedule = {
  weekday: Weekday;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
};

export type HoursValidationError = {
  message: string;
  weekday?: Weekday;
};

const TIME_HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isBusinessTimezone(value: string): value is BusinessTimezone {
  return (BUSINESS_TIMEZONES as readonly string[]).includes(value);
}

/** Normalize DB/time input to HH:MM. */
export function normalizeTimeHhMm(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // Accept HH:MM:SS from Postgres time
  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseTimeToMinutes(hhmm: string): number | null {
  const normalized = normalizeTimeHhMm(hhmm);
  if (!normalized || !TIME_HH_MM.test(normalized)) {
    return null;
  }
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

export function validateTimezone(
  value: string,
): { ok: true; value: string } | { ok: false; error: HoursValidationError } {
  const tz = value.trim();
  if (!tz) {
    return { ok: false, error: { message: "Choose a business timezone." } };
  }
  // Curated list or previously stored IANA id; DB still validates via pg_timezone_names.
  if (
    !isBusinessTimezone(tz) &&
    tz !== "UTC" &&
    !/^[A-Za-z_]+\/[A-Za-z0-9_\-+/]+$/.test(tz)
  ) {
    return { ok: false, error: { message: "Choose a valid timezone." } };
  }
  return { ok: true, value: tz };
}

export function validateWeeklySchedule(
  days: DayScheduleInput[],
):
  | { ok: true; value: NormalizedDaySchedule[] }
  | { ok: false; error: HoursValidationError } {
  if (days.length !== 7) {
    return {
      ok: false,
      error: { message: "Schedule must include Monday through Sunday." },
    };
  }

  const seen = new Set<number>();
  const normalized: NormalizedDaySchedule[] = [];

  for (const day of days) {
    if (day.weekday < 1 || day.weekday > 7 || seen.has(day.weekday)) {
      return {
        ok: false,
        error: { message: "Each weekday must appear exactly once.", weekday: day.weekday },
      };
    }
    seen.add(day.weekday);

    if (day.isClosed) {
      normalized.push({
        weekday: day.weekday,
        is_closed: true,
        open_time: null,
        close_time: null,
      });
      continue;
    }

    const open = normalizeTimeHhMm(day.openTime);
    const close = normalizeTimeHhMm(day.closeTime);
    if (!open || !close) {
      return {
        ok: false,
        error: {
          message: "Open days need a valid start and end time (HH:MM).",
          weekday: day.weekday,
        },
      };
    }

    const openMin = parseTimeToMinutes(open);
    const closeMin = parseTimeToMinutes(close);
    if (openMin === null || closeMin === null || openMin >= closeMin) {
      return {
        ok: false,
        error: {
          message: "Start time must be earlier than end time.",
          weekday: day.weekday,
        },
      };
    }

    normalized.push({
      weekday: day.weekday,
      is_closed: false,
      open_time: open,
      close_time: close,
    });
  }

  if (seen.size !== 7) {
    return {
      ok: false,
      error: { message: "Schedule must include Monday through Sunday." },
    };
  }

  return { ok: true, value: normalized };
}

export function defaultWeeklySchedule(): DayScheduleInput[] {
  return WEEKDAY_LABELS.map(({ weekday }) => ({
    weekday,
    isClosed: false,
    openTime: "00:00",
    closeTime: "23:59",
  }));
}

export function formatTimeForDisplay(hhmm: string | null | undefined): string {
  const normalized = hhmm ? normalizeTimeHhMm(hhmm) : null;
  if (!normalized) {
    return "";
  }
  const minutes = parseTimeToMinutes(normalized);
  if (minutes === null) {
    return normalized;
  }
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export type PublicAvailability = {
  businessIsOpen: boolean;
  todayIsClosed: boolean;
  todayOpenTime: string | null;
  todayCloseTime: string | null;
  timezone: string;
};

export type PublicAvailabilityCopy = {
  statusLabel: "Open" | "Closed" | "Closed today";
  detail: string | null;
};

/** Customer-facing availability copy (queue status is separate). */
export function publicAvailabilityCopy(
  availability: PublicAvailability,
  now: Date = new Date(),
): PublicAvailabilityCopy {
  if (availability.businessIsOpen) {
    const open = formatTimeForDisplay(availability.todayOpenTime);
    const close = formatTimeForDisplay(availability.todayCloseTime);
    return {
      statusLabel: "Open",
      detail: open && close ? `Hours today: ${open} – ${close}` : null,
    };
  }

  if (availability.todayIsClosed) {
    return { statusLabel: "Closed today", detail: null };
  }

  const openLabel = formatTimeForDisplay(availability.todayOpenTime);
  const openMin = availability.todayOpenTime
    ? parseTimeToMinutes(availability.todayOpenTime)
    : null;
  const { hour, minute } = getZonedParts(now, availability.timezone);
  const nowMin = hour * 60 + minute;

  // Before opening → "Opens at …"; at/after closing → plain Closed
  if (openLabel && openMin !== null && nowMin < openMin) {
    return {
      statusLabel: "Closed",
      detail: `Opens at ${openLabel}`,
    };
  }

  return { statusLabel: "Closed", detail: null };
}

/**
 * Prefer queue-status messaging when the business is open; otherwise business hours.
 */
export function publicJoinBlockedReason(options: {
  businessIsOpen: boolean;
  queueStatus: "open" | "paused" | "closed";
  isFull: boolean;
}): string | null {
  if (!options.businessIsOpen) {
    return "Business closed";
  }
  if (options.queueStatus === "paused") {
    return "Queue paused";
  }
  if (options.queueStatus === "closed") {
    return "Queue closed";
  }
  if (options.isFull) {
    return "Queue full";
  }
  return null;
}

/** Local wall-clock parts in a business IANA timezone. */
export function getZonedParts(
  date: Date,
  timeZone: string,
): { weekdayIso: Weekday; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const weekdayMap: Record<string, Weekday> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  const weekdayIso = weekdayMap[map.weekday ?? ""] ?? 1;
  return {
    weekdayIso,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/**
 * Milliseconds until the next open/close/midnight boundary for UI refresh.
 * Does not authorize joins — DB remains authoritative.
 */
export function msUntilNextScheduleBoundary(
  availability: PublicAvailability,
  now: Date = new Date(),
): number {
  const { hour, minute, second } = getZonedParts(now, availability.timezone);
  const nowMinutes = hour * 60 + minute;
  const nowSecondsOfDay = nowMinutes * 60 + second;

  const delayToLocalClock = (targetHour: number, targetMinute: number) => {
    const targetSeconds = targetHour * 60 * 60 + targetMinute * 60;
    let delta = targetSeconds - nowSecondsOfDay;
    if (delta <= 0) {
      delta += 24 * 60 * 60;
    }
    return delta * 1000;
  };

  if (availability.todayIsClosed) {
    // Refresh shortly after local midnight when weekday/schedule flips.
    return delayToLocalClock(0, 0);
  }

  const open = availability.todayOpenTime
    ? parseTimeToMinutes(availability.todayOpenTime)
    : null;
  const close = availability.todayCloseTime
    ? parseTimeToMinutes(availability.todayCloseTime)
    : null;

  if (open === null || close === null) {
    return delayToLocalClock(0, 0);
  }

  if (nowMinutes < open) {
    return delayToLocalClock(Math.floor(open / 60), open % 60);
  }
  if (nowMinutes < close) {
    return delayToLocalClock(Math.floor(close / 60), close % 60);
  }
  return delayToLocalClock(0, 0);
}
