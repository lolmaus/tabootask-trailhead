/** Vitest's glob transform; keep Vite out of the backend's direct dependencies. */
interface ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}
