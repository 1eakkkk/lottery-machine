export interface Progress {
  id: string;
  masks: string[];
  revealed: boolean[];
}
export function decodeMask(value: string, size: number): Uint8Array {
  const result = new Uint8Array(size);
  try {
    const decoded = atob(value);
    for (let i = 0; i < Math.min(size, decoded.length); i++)
      result[i] = decoded.charCodeAt(i);
  } catch {}
  return result;
}
export function encodeMask(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
export function mergeProgress(a: Progress, b: Progress): Progress {
  const length = Math.max(
      a.masks.length,
      b.masks.length,
      a.revealed.length,
      b.revealed.length,
    ),
    masks: string[] = [],
    revealed: boolean[] = [];
  for (let i = 0; i < length; i++) {
    const aa = decodeMask(a.masks[i] ?? "", 768),
      bb = decodeMask(b.masks[i] ?? "", 768);
    for (let j = 0; j < aa.length; j++) aa[j] |= bb[j];
    masks[i] = encodeMask(aa);
    revealed[i] = !!a.revealed[i] || !!b.revealed[i];
  }
  return { id: b.id, masks, revealed };
}
