import type { AccountSession } from "../types/profile.types";

export const normalizeName = (value: string): string => value.trim().replace(/\s+/g, " ");

export const getInitials = (name: string | null | undefined): string => {
  const words = normalizeName(name ?? "")
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "U";
  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1] ?? "")[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "U";
};

export const avatarTones = [
  "bg-neutral-900 text-neutral-50",
  "bg-stone-200 text-stone-800",
  "bg-zinc-300 text-zinc-900",
  "bg-slate-200 text-slate-800",
  "bg-neutral-700 text-neutral-50",
  "bg-gray-200 text-gray-900",
] as const;

const hashString = (value: string): number => {
  let hash = 5381;
  for (const character of value) hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  return hash;
};

export const avatarTone = (name: string | null | undefined): string => {
  const key = normalizeName(name ?? "").toLowerCase();
  return avatarTones[hashString(key) % avatarTones.length] as string;
};

export type PasswordInputs = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type PasswordRequirement = {
  id: "length" | "different" | "match";
  label: string;
  met: boolean;
};

export const passwordRequirements = (input: PasswordInputs): PasswordRequirement[] => [
  {
    id: "length",
    label: "At least 8 characters",
    met: input.newPassword.length >= 8 && input.newPassword.length <= 128,
  },
  {
    id: "different",
    label: "Different from your current password",
    met: input.newPassword.length > 0 && input.newPassword !== input.currentPassword,
  },
  {
    id: "match",
    label: "Matches the confirmation",
    met: input.newPassword.length > 0 && input.newPassword === input.confirmPassword,
  },
];

export const canSubmitPassword = (input: PasswordInputs): boolean =>
  input.currentPassword.length > 0 && passwordRequirements(input).every((item) => item.met);

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

export const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatRelativeTime = (iso: string, now: number = Date.now()): string => {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "Unknown";
  const diff = Math.max(0, now - time);
  if (diff < minute) return "Just now";
  if (diff < hour) {
    const value = Math.floor(diff / minute);
    return `${value} minute${value === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const value = Math.floor(diff / hour);
    return `${value} hour${value === 1 ? "" : "s"} ago`;
  }
  if (diff < 30 * day) {
    const value = Math.floor(diff / day);
    return `${value} day${value === 1 ? "" : "s"} ago`;
  }
  return formatDate(iso);
};

export const sortSessions = (sessions: AccountSession[]): AccountSession[] =>
  [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt);
  });

export const sessionLabel = (session: Pick<AccountSession, "device" | "current">): string => {
  const device = session.device.trim() || "Unknown device";
  return session.current ? `${device} (this device)` : device;
};

export const countOtherSessions = (sessions: AccountSession[]): number =>
  sessions.filter((session) => !session.current).length;

export const mapServerFieldErrors = <T extends string>(
  fieldErrors: Record<string, string>,
  allowed: readonly T[],
): Array<{ field: T; message: string }> =>
  Object.entries(fieldErrors)
    .filter((entry): entry is [T, string] => (allowed as readonly string[]).includes(entry[0]))
    .map(([field, message]) => ({ field, message }));

export const buildStatLinks = (routes: { statusPages: boolean }) =>
  [
    { key: "monitors", label: "Monitors", to: "/monitors" },
    { key: "activeMonitors", label: "Active monitors", to: "/monitors" },
    { key: "openIncidents", label: "Open incidents", to: "/incidents" },
    { key: "statusPages", label: "Status pages", to: routes.statusPages ? "/status-pages" : null },
  ] as const;
