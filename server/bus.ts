export type MailEvent = { type: "changed" };

type Listener = (event: MailEvent) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;

export const bus = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function notify(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const event: MailEvent = { type: "changed" };
    for (const listener of listeners) listener(event);
  }, 150);
}
