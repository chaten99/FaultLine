type Listener = () => void;

const listeners = new Set<Listener>();

export const onWorkspaceAccessLost = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emitWorkspaceAccessLost = () => {
  listeners.forEach((listener) => listener());
};
