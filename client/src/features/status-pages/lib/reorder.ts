export const moveItem = <T>(items: T[], index: number, direction: -1 | 1): T[] => {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
};

export const reorderAnnouncement = (name: string, from: number, to: number, total: number) =>
  `${name} moved from position ${from + 1} to position ${to + 1} of ${total}.`;
