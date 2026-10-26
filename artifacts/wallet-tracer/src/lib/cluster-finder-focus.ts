import type { ClusterFlow } from "./cluster-finder-engine";

export interface ClusterFocusConnection {
  focusAddress: string;
  hopCount: number;
  nodes: string[];
  flows: Array<ClusterFlow & { hop: number }>;
}

/** Observed shortest IN/OUT connections, bounded by lead-to-focus hop count. */
export function findClusterFocusPaths(
  primary: string, focuses: string[], flows: ClusterFlow[], maxHops: number,
): ClusterFocusConnection[] {
  const adjacent = new Map<string, ClusterFlow[]>();
  for (const flow of flows) {
    for (const address of [flow.from, flow.to]) {
      const list = adjacent.get(address) ?? [];
      list.push(flow);
      adjacent.set(address, list);
    }
  }
  const distance = new Map([[primary, 0]]);
  const queue = [primary];
  for (let index = 0; index < queue.length; index++) {
    const address = queue[index];
    if (distance.get(address)! >= maxHops) continue;
    for (const flow of adjacent.get(address) ?? []) {
      const next = flow.from === address ? flow.to : flow.from;
      if (distance.has(next)) continue;
      distance.set(next, distance.get(address)! + 1);
      queue.push(next);
    }
  }
  const connections: ClusterFocusConnection[] = [];
  for (const focusAddress of focuses) {
    const hopCount = distance.get(focusAddress);
    if (!hopCount) continue;
    const nodes = new Set([focusAddress]);
    const pending = [focusAddress];
    const routes = new Map<string, ClusterFlow & { hop: number }>();
    for (let index = 0; index < pending.length; index++) {
      const current = pending[index];
      for (const flow of adjacent.get(current) ?? []) {
        const next = flow.from === current ? flow.to : flow.from;
        if (distance.get(next) !== distance.get(current)! - 1) continue;
        routes.set(flow.id, { ...flow, hop: distance.get(current)! });
        if (nodes.has(next)) continue;
        nodes.add(next);
        pending.push(next);
      }
    }
    connections.push({
      focusAddress, hopCount,
      nodes: [...nodes].sort((a, b) => distance.get(a)! - distance.get(b)! || a.localeCompare(b)),
      flows: [...routes.values()].sort((a, b) => a.hop - b.hop || a.id.localeCompare(b.id)),
    });
  }
  return connections;
}
