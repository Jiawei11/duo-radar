import type { TargetState } from "./types";
import { targetKey } from "./types";

/** Session-only presentation order; never changes saved targets or query scheduling. */
export function createStockPriority() {
  const arrivals = new Map<string, number>();
  return (rows: TargetState[]): TargetState[] => {
    const available = new Set<string>();
    for (const row of rows) {
      if (row.availability.kind !== "in_stock") continue;
      const key = targetKey(row.target);
      available.add(key);
      if (!arrivals.has(key)) arrivals.set(key, row.lastCheckedMs ?? Date.now());
    }
    for (const key of arrivals.keys()) {
      if (!available.has(key)) arrivals.delete(key);
    }
    // Stable sort keeps the original task order for equal timestamps and other rows.
    return [...rows].sort((a, b) => {
      const first = arrivals.get(targetKey(a.target));
      const second = arrivals.get(targetKey(b.target));
      if (first === undefined) return second === undefined ? 0 : 1;
      if (second === undefined) return -1;
      return second - first;
    });
  };
}
