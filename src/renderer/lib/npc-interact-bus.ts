/** Bus: server out-of-range rejection signals classified from inbound text channels. */
type Listener = () => void;

const listeners = new Set<Listener>();

export const onNpcInteractOutOfRange = (handler: Listener): (() => void) => {
  listeners.add(handler);
  return () => listeners.delete(handler);
};

export const emitNpcInteractOutOfRange = (): void => {
  for (const handler of Array.from(listeners)) handler();
};
