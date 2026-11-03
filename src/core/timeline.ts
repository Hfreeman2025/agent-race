import type { RaceEvent } from "./schema";
export function mergeTimeline(events: RaceEvent[]): RaceEvent[] {
  return [...events].sort((a, b) => a.at - b.at || a.agent.localeCompare(b.agent) || a.seq - b.seq);
}
export function formatTime(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}
