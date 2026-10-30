import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Server and browser must render identical text, so no locale/timezone-dependent formatting. */
export function formatUtcTimestamp(date: Date) {
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
