import type { ClusterFlow, ClusterNode } from "./cluster-finder-engine";

/** Display-only projection. Never changes scan results, transactions, or reports. */
export function filterClusterGraph(nodes: ClusterNode[], flows: ClusterFlow[]) {
  const seeds = nodes.filter((node) => node.role !== "proxy").map((node) => node.address);
  const neighbors = new Map(nodes.map((node) => [node.address, new Set<string>()]));
  for (const flow of flows) {
    if (!neighbors.has(flow.from) || !neighbors.has(flow.to)) continue;
    neighbors.get(flow.from)!.add(flow.to);
    neighbors.get(flow.to)!.add(flow.from);
  }
  const visible = new Set(seeds);
  const distances = (roots: string[]) => {
    const depth = new Map(roots.map((address) => [address, 0]));
    const queue = [...roots];
    for (let index = 0; index < queue.length; index++) {
      const address = queue[index];
      for (const next of neighbors.get(address) ?? []) {
        if (depth.has(next)) continue;
        depth.set(next, depth.get(address)! + 1);
        queue.push(next);
      }
    }
    return depth;
  };
  // Retain every shortest route back to a search wallet, not just one
  // arbitrary BFS parent. Connectivity is undirected; arrows stay unchanged.
  const retainRoutes = (depth: Map<string, number>, targets: string[]) => {
    const pending = [...targets];
    const visited = new Set(targets);
    for (let index = 0; index < pending.length; index++) {
      const address = pending[index];
      visible.add(address);
      for (const next of neighbors.get(address) ?? []) {
        if (depth.get(next) !== depth.get(address)! - 1 || visited.has(next)) continue;
        visited.add(next);
        pending.push(next);
      }
    }
  };
  const nearestSeed = distances(seeds);
  retainRoutes(nearestSeed, [...nearestSeed].filter(([, hops]) => hops >= 3).map(([address]) => address));
  // Short paths are still useful when they connect explicitly entered wallets.
  for (const seed of seeds) {
    const depth = distances([seed]);
    retainRoutes(depth, seeds.filter((other) => other !== seed && depth.has(other)));
  }
  return {
    nodes: nodes.filter((node) => visible.has(node.address)),
    flows: flows.filter((flow) => visible.has(flow.from) && visible.has(flow.to)),
  };
}
