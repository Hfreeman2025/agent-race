import { eventDiff } from "../src/core/diffs";
import type { RaceEvent, Recording } from "../src/core/schema";
import { formatTime } from "../src/core/timeline";
import { escapeHtml as html } from "./escape";

function short(e: RaceEvent): string {
  if (e.phase === "acceptance") return `Hidden acceptance · ${e.exitCode === 0 ? "PASS" : "FAIL"}`;
  if (e.kind === "claim")
    return `Receipts · ${e.claims?.map((c) => c.verdict).join(" / ") ?? "No verdict"}`;
  if (e.kind === "edit") return e.title.replace("<repo>/", "");
  return (
    e.title
      .replace(/^\/bin\/zsh -lc\s*/u, "")
      .replaceAll("<repo>/", "")
      .split("\n")[0]
      ?.slice(0, 100) ?? e.kind
  );
}
export function eventButton(recording: Recording, e: RaceEvent): string {
  return `<button type="button" class="event ${e.agent} ${e.kind}" data-event="${html(e.id)}"><time>${formatTime(e.at)}</time><span class="event-kind">${e.phase === "acceptance" ? "CHECK" : e.kind.toUpperCase()}</span><span class="event-title">${html(short(e))}</span><span class="event-open">${eventDiff(recording.events, e) ? "DIFF +" : "OPEN +"}</span></button>`;
}
export function eventEvidence(recording: Recording, event: RaceEvent, rule?: string): string {
  const patch = eventDiff(recording.events, event);
  const claims =
    event.claims
      ?.map(
        (c) =>
          `<div class="receipt"><strong class="${c.verdict.toLowerCase()}">${html(c.verdict)}</strong><p>${html(c.text)}</p><p>${html(c.reason)}</p>${c.receiptId ? `<small>Receipt ${html(c.receiptId)}</small>` : ""}${c.originalVerdict ? `<p>Original verdict: ${html(c.originalVerdict)}</p>` : ""}</div>`,
      )
      .join("") ?? "";
  const unmatched =
    event.kind === "message" && /\bverification passed\b/iu.test(event.detail ?? event.title)
      ? '<aside class="unmatched"><strong>No claim verdict recorded</strong><p>This wording was not recognised by receipts. An absent verdict is not verification.</p></aside>'
      : "";
  return `<p class="evidence-rule">${html(rule ?? "RECORDED EVENT")}</p>${
    patch
      ? `<h3 class="evidence-heading">${html(event.title.replace("<repo>/", ""))}</h3>${patch.shared ? "<p>Per-file patch from the same recorded edit transaction.</p>" : ""}<pre class="diff">${patch.text
          .split("\n")
          .map(
            (line) =>
              `<span class="${line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : ""}">${html(line)}</span>`,
          )
          .join("")}</pre>`
      : `${claims}${unmatched}<h3 class="evidence-heading">${event.kind === "claim" || event.kind === "message" ? "Agent’s words" : "Recorded command & output"}</h3><pre>${html(event.title)}${event.detail && event.detail !== event.title ? `\n\n${html(event.detail)}` : ""}</pre>`
  }${event.exitCode !== undefined ? `<p>Observed shell exit: <strong>${event.exitCode ?? "unknown"}</strong>. Inner test output is assessed separately.</p>` : ""}`;
}
