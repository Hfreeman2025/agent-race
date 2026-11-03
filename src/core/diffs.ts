import type { RaceEvent } from "./schema";

function fileSection(diff: string, title: string): string | undefined {
  const target = title.replace(/^<repo>\//u, "");
  return diff.split(/(?=^Index: )/mu).find((section) => section.startsWith(`Index: ${target}\n`));
}
/** Codex can report several changed files in one timestamped patch transaction. */
export function eventDiff(
  events: RaceEvent[],
  event: RaceEvent,
): { text: string; shared: boolean } | undefined {
  if (event.diff)
    return { text: fileSection(event.diff, event.title) ?? event.diff, shared: false };
  if (event.kind !== "edit") return undefined;
  for (const sibling of events)
    if (
      sibling.agent === event.agent &&
      sibling.at === event.at &&
      sibling.kind === "edit" &&
      sibling.diff
    ) {
      const section = fileSection(sibling.diff, event.title);
      if (section) return { text: section, shared: true };
    }
  return undefined;
}
