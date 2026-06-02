export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): Debounced<A> {
  let t: ReturnType<typeof setTimeout> | null = null;
  const d = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  (d as Debounced<A>).cancel = () => { if (t) { clearTimeout(t); t = null; } };
  return d as Debounced<A>;
}
