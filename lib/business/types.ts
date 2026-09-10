export const BUSINESS_TYPES = [
  "Salon",
  "Barbershop",
  "Clinic",
  "Restaurant",
  "University",
  "Government Office",
  "Pharmacy",
  "Repair Shop",
  "Other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPES as readonly string[]).includes(value);
}
