import type {
  IncidentList,
  PublicIncident,
  PublicStatusPayload,
  StatusBlock,
} from "../types/status-page.types";

export const mergeStatusBlock = (
  payload: PublicStatusPayload | undefined,
  status: StatusBlock,
): PublicStatusPayload | undefined => (payload ? { ...payload, status } : payload);

export const mergeIncidentIntoPayload = (
  payload: PublicStatusPayload | undefined,
  incident: PublicIncident,
): PublicStatusPayload | undefined => {
  if (!payload) return payload;
  const others = payload.incidents.active.filter((item) => item.id !== incident.id);
  const active = incident.status === "resolved" ? others : [incident, ...others];
  active.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return { ...payload, incidents: { active } };
};

export const mergeIncidentIntoList = (
  list: IncidentList | undefined,
  incident: PublicIncident,
  filter: "all" | "active" | "resolved",
): IncidentList | undefined => {
  if (!list) return list;
  const matches =
    filter === "all" || (filter === "resolved" ? incident.status === "resolved" : incident.ongoing);
  const existing = list.items.some((item) => item.id === incident.id);
  const without = list.items.filter((item) => item.id !== incident.id);
  if (!matches) {
    return existing ? { ...list, items: without, total: Math.max(0, list.total - 1) } : list;
  }
  const items = [incident, ...without].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
  return { ...list, items, total: existing ? list.total : list.total + 1 };
};

export const appendPages = (pages: IncidentList[] | undefined): PublicIncident[] => {
  const seen = new Set<string>();
  const result: PublicIncident[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
};
