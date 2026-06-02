// Tiny hyperscript helper that produces Satori-compatible "JSX" nodes without needing a JSX runtime.
export type SatoriNode = {
  type: string;
  props: { [k: string]: unknown; children?: unknown };
};

export function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): SatoriNode {
  const flat: unknown[] = [];
  for (const c of children) {
    if (Array.isArray(c)) flat.push(...c);
    else if (c !== null && c !== undefined && c !== false) flat.push(c);
  }
  const finalChildren = flat.length === 1 ? flat[0] : flat;
  return { type, props: { ...(props ?? {}), children: finalChildren } };
}
