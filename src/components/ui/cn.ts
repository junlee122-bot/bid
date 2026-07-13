export type ClassValue = string | false | null | undefined;

/** Lightweight class combiner kept dependency-free by design. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
