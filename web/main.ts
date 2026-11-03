import "./csp";
import { ArchiveSchema } from "../src/core/archive";
import {
  agentNames,
  commentary,
  currentCall,
  finishSummary,
  type Sector,
  sectorGap,
  sectorNames,
  sectors,
} from "../src/core/broadcast";
import { eventDiff } from "../src/core/diffs";
import { type Agent, type RaceEvent, type Recording, RecordingSchema } from "../src/core/schema";
import { formatTime } from "../src/core/timeline";
import { mountFlight } from "./flight";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("App root missing");
const app = root;
const agents: Agent[] = ["claude", "codex"];
const sectorKeys: Sector[] = ["read", "edit", "test", "verified"];
const html = (text: string) =>
  text.replace(
    /[&<>"']/gu,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
const time = (n: number) => `${(n / 1000).toFixed(3)}`;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const archiveOptions = [
  { id: "demo", label: "Cache race · both accepted", file: "demo.json" },
  {
    id: "attempt-1",
    label: "Earlier attempt 1 · startup failures",
    file: "unicode-slug-2026-11-01T11-49-17-501Z.json",
  },
  {
    id: "attempt-2",
    label: "Earlier attempt 2 · incomplete race",
    file: "unicode-slug-2026-11-01T11-50-08-213Z.json",
  },
];
let archiveChoice =
  archiveOptions.find(
    (option) => option.id === new URL(location.href).searchParams.get("recording"),
  ) ?? archiveOptions[0];
if (!archiveChoice) throw new Error("Default archive option missing");
let recording: Recording;
let calls: ReturnType<typeof commentary> = [];
let position = 0;
let speed = 8;
let playing = false;
let previous = 0;
let painted = 0;
let raf = 0;
let count = -1;
let filter = "all";
let selected: string | null = null;
let focusOrigin: HTMLElement | null = null;
let generation = 0;
let dialogVersion = 0;
function must<T extends Element = HTMLElement>(selector: string): T {
  const element = app.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
function frame(): string {
  const replay = new URL(location.href).searchParams.get("view") === "replay";
  return `<a href="${replay ? "#race" : "#flight"}" class="skip">Skip to viewer</a><header class="masthead"><a href="/" class="wordmark"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><h1>AGENT RACE</h1></a><span class="record-label">REAL RECORDING<span id="record-date"> · LOCAL REPLAY</span></span><button type="button" id="guide-open">How to watch</button></header>
  <main><div class="challenge"><div><span class="challenge-label">CHALLENGE</span><h2 id="race-title">The double fetch</h2><span class="challenge-summary">Two agents fix the same concurrent cache bug.</span></div><button type="button" id="brief-open" disabled>Read brief</button></div>
  <nav class="view-switch" aria-label="Viewer"><button type="button" id="flight-view" aria-pressed="${!replay}" disabled>Flight recorder</button><button type="button" id="replay-view" aria-pressed="${replay}" disabled>Race replay</button><label for="recording-choice" class="archive-choice"><span>RECORDING</span><select id="recording-choice" aria-label="Recording" disabled>${archiveOptions.map((option) => `<option value="${option.id}" ${option.id === archiveChoice?.id ? "selected" : ""}>${option.label}</option>`).join("")}</select></label></nav><section id="flight" tabindex="-1" aria-label="Flight recorder" ${replay ? "hidden" : ""}><div class="trace-loading"><span class="flight-kicker">FLIGHT RECORDER</span><h2>Causal trace</h2><p id="flight-status" role="status">Opening the original recording…</p><div class="loading-lanes"><p>Claude Code <span>Waiting for recorded events</span></p><p>Codex <span>Waiting for recorded events</span></p></div></div></section><section class="broadcast" id="race" ${replay ? "" : "hidden"} tabindex="-1" aria-label="Race replay"><div class="control"><div class="session"><span class="signal" id="signal"></span><strong id="session-status">OPENING ARCHIVE</strong><span class="session-detail">Launch → acceptance</span></div><div class="clock"><output id="clock" aria-label="Elapsed race time">0:00.0</output><span id="duration">/ 1:17.8</span></div><div class="playback"><button type="button" id="restart" aria-label="Restart replay" disabled>↺</button><button type="button" id="play" aria-label="Play replay" disabled>Play</button><label class="speed-label" for="speed">Speed</label><select id="speed" aria-label="Replay speed" disabled><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8" selected>8×</option></select><button type="button" id="finish" disabled>Finish</button></div></div>
  <div class="race-surface"><aside class="tower" aria-label="Timing tower"><div class="panel-heading">TIMING TOWER<span>LAST SPLIT / SEC</span></div>${agents.map((agent, i) => `<div class="tower-row ${agent}" id="tower-${agent}"><span class="position" id="rank-${agent}">${i === 0 ? "A" : "B"}</span><div><strong>${agentNames[agent]}</strong><span id="state-${agent}">Awaiting recording</span></div><b id="time-${agent}">—</b></div>`).join("")}<div class="gap"><span id="gap-label">MATCHING SECTOR GAP</span><strong id="gap">—</strong><p id="gap-note">Only observed splits. No estimated progress.</p></div><div class="tower-foot">One race. No general model ranking.</div></aside>
  <div class="lanes"><div class="panel-heading"><span>SECTOR SPLITS <span class="muted">/ FROM LAUNCH</span></span><span>READ · EDIT · TEST · VERIFIED</span></div>${agents.map((agent) => `<section class="lane ${agent}" aria-label="${agentNames[agent]} race lane"><div class="lane-head"><h3>${agentNames[agent]}</h3><span id="lane-status-${agent}">Awaiting recording</span></div><div class="splits">${sectorKeys.map((sector) => `<button type="button" class="split" data-sector="${agent}:${sector}" disabled><span>${sectorNames[sector]}</span><strong id="split-${agent}-${sector}">—</strong></button>`).join("")}</div><div class="lane-events" id="events-${agent}"><p class="waiting">Opening the original event stream…</p></div></section>`).join("")}<div class="photo" id="photo" hidden></div></div>
  <aside id="inspector" class="inspector" aria-label="Event picture in picture" hidden><div class="inspector-head"><strong id="inspector-title">EVENT EVIDENCE</strong><button type="button" id="inspector-close" aria-label="Close evidence">Close ×</button></div><div id="inspector-body" tabindex="0"></div></aside></div>
  <div class="timeline"><div class="timeline-labels"><span>LAUNCH</span><span id="timeline-middle">SHARED CLOCK</span><span>ACCEPTANCE</span></div><div class="timeline-track"><div id="sweep"></div><div id="marks"></div><input id="scrubber" type="range" min="0" max="77793" value="0" aria-label="Replay position" disabled></div></div>
  <div class="booth" id="booth"><div class="booth-label"><span>RACE CONTROL</span><span id="call-time">0:00.0</span></div><div class="booth-copy"><p id="call-text" aria-live="polite" aria-atomic="true">Opening the real recording. No agent is running in this browser.</p><button type="button" id="call-source" disabled>DETERMINISTIC COMMENTARY · WAITING FOR EVIDENCE</button></div></div></section>
  <section class="lower" ${replay ? "" : "hidden"}><div class="ledger"><div class="ledger-head"><h2>Event ledger <span id="event-count">0 / 0</span></h2><div role="group" aria-label="Filter events"><button type="button" data-filter="all" aria-pressed="true">All</button><button type="button" data-filter="edit" aria-pressed="false">Diffs</button><button type="button" data-filter="claim" aria-pressed="false">Claims</button></div></div><div id="ledger"><p class="empty-ledger">Events appear here as the replay advances.</p></div></div><aside class="method"><h2>How the finish is measured.</h2><p>Identical prompts. Fresh isolated repos. Real CLI streams. A finish is the harness’s independent hidden acceptance check, after the agent exits.</p><p>Splits show the first observed read, edit and test command, including a failed attempt. Tests starting is not tests passing. Provider startup, shutdown and local checking are on the clock.</p><button type="button" id="provenance-open" disabled>Recording & privacy</button><button type="button" id="history-open" disabled>Earlier attempts</button><p class="method-foot">Rules generate every commentary line. Open its source to inspect the exact event. Receipts checks claims; acceptance checks fixes.</p></aside></section></main>
  <footer><span>AGENT RACE / HARRY FREEMAN</span><span>Recorded, never simulated. Local replay.</span></footer><dialog id="dialog" aria-labelledby="dialog-title"><div class="dialog-head"><strong id="dialog-title"></strong><button type="button" id="dialog-close" aria-label="Close dialog">Close ×</button></div><div id="dialog-body"></div></dialog>`;
}
async function load(): Promise<void> {
  const loadId = ++generation;
  app.innerHTML = frame();
  app.classList.toggle("is-replay", new URL(location.href).searchParams.get("view") === "replay");
  must("#guide-open").addEventListener("click", guide);
  must("#dialog-close").addEventListener("click", () => must<HTMLDialogElement>("#dialog").close());
  const slow = setTimeout(() => {
    if (loadId !== generation) return;
    must("#session-status").textContent = "STILL OPENING";
    must("#flight-status").textContent =
      "The local archive is taking longer than usual. Waiting for real data.";
    must("#call-text").textContent =
      "The local archive is taking longer than usual. The clock waits for real data.";
  }, 1500);
  try {
    const response = await fetch(`/recordings/${archiveChoice?.file ?? "demo.json"}`);
    if (!response.ok) throw new Error("Archive unavailable");
    const originalBytes = new Uint8Array(await response.arrayBuffer());
    const data: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(originalBytes),
    );
    recording = RecordingSchema.parse(data);
    if (loadId !== generation) return;
    clearTimeout(slow);
    calls = commentary(recording);
    position = 0;
    count = -1;
    selected = null;
    must("#race-title").textContent = recording.title;
    must(".challenge-summary").textContent =
      recording.challenge === "single-flight"
        ? "Two agents fix the same concurrent cache bug."
        : "Two agents attempt the same Unicode slug bug.";
    must<HTMLSelectElement>("#recording-choice").addEventListener("change", (e) => {
      if (e.target instanceof HTMLSelectElement) {
        const value = e.target.value;
        const option = archiveOptions.find((o) => o.id === value);
        if (option) {
          pause();
          archiveChoice = option;
          void load();
        }
      }
    });
    must("#record-date").textContent =
      ` · ${new Date(recording.recordedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase()}`;
    must("#duration").textContent = `/ ${formatTime(recording.duration)}`;
    must<HTMLInputElement>("#scrubber").max = String(recording.duration);
    for (const id of [
      "restart",
      "play",
      "speed",
      "finish",
      "scrubber",
      "brief-open",
      "provenance-open",
      "history-open",
      "flight-view",
      "replay-view",
      "recording-choice",
    ])
      must<HTMLButtonElement>(`#${id}`).disabled = false;
    must("#marks").innerHTML = recording.events
      .map(
        (e) =>
          `<button type="button" class="mark ${e.agent} ${e.phase === "acceptance" ? "finish-mark" : ""}" data-mark="${html(e.id)}" aria-label="${html(`${agentNames[e.agent]} ${e.kind} at ${time(e.at)} seconds`)}"></button>`,
      )
      .join("");
    for (const e of recording.events)
      must<HTMLElement>(`[data-mark="${e.id}"]`).style.left =
        `${(e.at / recording.duration) * 100}%`;
    if (!recording.events.length)
      for (const id of ["restart", "play", "speed", "finish", "scrubber"])
        must<HTMLButtonElement>(`#${id}`).disabled = true;
    wire();
    mountFlight(must("#flight"), recording, originalBytes);
    const replay = new URL(location.href).searchParams.get("view") === "replay";
    function switchView(isReplay: boolean): void {
      app.classList.toggle("is-replay", isReplay);
      must<HTMLAnchorElement>(".skip").href = isReplay ? "#race" : "#flight";
      must<HTMLElement>("#flight").hidden = isReplay;
      must<HTMLElement>("#race").hidden = !isReplay;
      must<HTMLElement>(".lower").hidden = !isReplay;
      must("#flight-view").setAttribute("aria-pressed", String(!isReplay));
      must("#replay-view").setAttribute("aria-pressed", String(isReplay));
      if (!isReplay) pause();
    }
    must("#flight-view").addEventListener("click", () => switchView(false));
    must("#replay-view").addEventListener("click", () => {
      switchView(true);
      if (!reduced.matches && !playing) toggle();
    });
    switchView(replay);
    render();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => performance.mark("race-meaningful-paint"));
    });
    if (replay && recording.events.length && !reduced.matches) toggle();
    else if (recording.events[0]) seek(recording.events[0].at);
  } catch {
    clearTimeout(slow);
    must("#flight").innerHTML =
      `<div class="trace-loading trace-unavailable"><span class="flight-kicker">FLIGHT RECORDER / ARCHIVE OFFLINE</span><h2>Recording unavailable.</h2><p>The original archive is missing or invalid. No events or connections are substituted.</p><button type="button" id="flight-retry">Retry archive</button></div>`;
    must("#flight-retry").addEventListener("click", () => void load());
    must("#session-status").textContent = "ARCHIVE OFFLINE";
    must("#signal").classList.add("warning");
    for (const agent of agents) {
      must(`#state-${agent}`).textContent = "No recording";
      must(`#lane-status-${agent}`).textContent = "Data unavailable";
      must(`#events-${agent}`).innerHTML =
        '<p class="waiting">No invented activity is substituted.</p>';
    }
    must("#call-text").textContent =
      "The recording is unavailable or invalid. Restore a valid local archive and retry.";
    must("#call-source").outerHTML = '<button type="button" id="retry">Retry archive</button>';
    must("#retry").addEventListener("click", () => void load());
  }
}
function wire(): void {
  must("#play").addEventListener("click", toggle);
  must("#restart").addEventListener("click", () => {
    pause();
    closeInspector();
    seek(0);
  });
  must("#finish").addEventListener("click", () => {
    pause();
    seek(recording.duration);
  });
  must<HTMLSelectElement>("#speed").addEventListener("change", (e) => {
    if (e.currentTarget instanceof HTMLSelectElement) speed = Number(e.currentTarget.value);
    renderPlayback();
  });
  must<HTMLInputElement>("#scrubber").addEventListener("input", (e) => {
    if (e.currentTarget instanceof HTMLInputElement) {
      pause();
      closeInspector();
      seek(Number(e.currentTarget.value));
    }
  });
  must("#brief-open").addEventListener("click", () =>
    dialog(
      "Identical prompt",
      `<h2>The challenge, verbatim.</h2><pre>${html(recording.prompt)}</pre>`,
    ),
  );
  must("#provenance-open").addEventListener("click", provenance);
  must("#history-open").addEventListener("click", () => void history());
  must("#inspector-close").addEventListener("click", closeInspector);
  must("#call-source").addEventListener("click", () => {
    const call = currentCall(calls, position);
    if (call.eventId) inspect(call.eventId, must("#call-source"));
    else provenance();
  });
}
function onAction(e: MouseEvent): void {
  if (!(e.target instanceof Element)) return;
  const button = e.target.closest<HTMLButtonElement>("button");
  if (!button) return;
  if (button.dataset.event) inspect(button.dataset.event, button);
  if (button.dataset.mark) {
    const event = recording.events.find((e) => e.id === button.dataset.mark);
    if (event) {
      pause();
      seek(event.at);
      inspect(event.id, button);
    }
  }
  if (button.dataset.sector) {
    const [agent, sector] = button.dataset.sector.split(":");
    if ((agent === "claude" || agent === "codex") && sectorKeys.includes(sector as Sector)) {
      const at = sectors(recording, agent)[sector as Sector];
      if (at !== null) {
        pause();
        closeInspector();
        seek(at);
      }
    }
  }
  if (button.dataset.filter) {
    filter = button.dataset.filter;
    for (const node of app.querySelectorAll("[data-filter]"))
      node.setAttribute("aria-pressed", String(node === button));
    count = -1;
    render();
  }
}
function pause(): void {
  playing = false;
  cancelAnimationFrame(raf);
  if (recording) renderPlayback();
}
function toggle(): void {
  if (!recording.events.length) return;
  if (playing) {
    pause();
    return;
  }
  if (position >= recording.duration) seek(0);
  playing = true;
  previous = performance.now();
  painted = 0;
  renderPlayback();
  raf = requestAnimationFrame(tick);
}
function tick(now: number): void {
  if (!playing) return;
  position = Math.min(recording.duration, position + (now - previous) * speed);
  previous = now;
  if (now - painted >= 50 || position === recording.duration) {
    render();
    painted = now;
  }
  if (position >= recording.duration) pause();
  else raf = requestAnimationFrame(tick);
}
function seek(at: number): void {
  position = Math.max(0, Math.min(recording.duration, at));
  render();
}
function renderPlayback(): void {
  must("#play").textContent = playing ? "Pause" : "Play";
  must("#play").setAttribute("aria-label", playing ? "Pause replay" : "Play replay");
  must("#session-status").textContent = !recording.events.length
    ? "NO EVENTS RECORDED"
    : position >= recording.duration
      ? "RACE COMPLETE"
      : playing
        ? `${speed}× RECORDED REPLAY`
        : "REPLAY PAUSED";
  must("#signal").classList.toggle("running", playing);
}
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
function eventButton(e: RaceEvent): string {
  return `<button type="button" class="event ${e.agent} ${e.kind}" data-event="${html(e.id)}"><time>${formatTime(e.at)}</time><span class="event-kind">${e.phase === "acceptance" ? "CHECK" : e.kind.toUpperCase()}</span><span class="event-title">${html(short(e))}</span><span class="event-open">${eventDiff(recording.events, e) ? "DIFF +" : "OPEN +"}</span></button>`;
}
function render(): void {
  const renderStart = performance.now();
  must("#clock").textContent = formatTime(position);
  must<HTMLInputElement>("#scrubber").value = String(position);
  must("#scrubber").setAttribute(
    "aria-valuetext",
    `${time(position)} seconds of ${time(recording.duration)}`,
  );
  must<HTMLElement>("#sweep").style.transform = `scaleX(${position / recording.duration})`;
  const seen = recording.events.filter((e) => e.at <= position);
  // Rebuild only on evidence boundaries; the clock never rebuilds the lanes.
  if (count !== seen.length) {
    count = seen.length;
    for (const agent of agents) {
      const lane = seen.filter((e) => e.agent === agent);
      const split = sectors(recording, agent);
      const result = recording.results.find((r) => r.agent === agent);
      const verified = split.verified !== null && split.verified <= position;
      const exited = result && result.finishedAt <= position;
      const status = verified
        ? "VERIFIED FIX"
        : exited && !result?.accepted
          ? "NOT ACCEPTED"
          : lane.length
            ? "ON TRACK"
            : "AWAITING FIRST EVENT";
      must(`#state-${agent}`).textContent = status;
      must(`#lane-status-${agent}`).textContent = status;
      must(`#tower-${agent}`).classList.toggle("verified", verified);
      const observed = sectorKeys
        .map((s) => split[s])
        .filter((n): n is number => n !== null && n <= position);
      must(`#time-${agent}`).textContent = observed.length ? time(Math.max(...observed)) : "—";
      for (const sector of sectorKeys) {
        const at = split[sector];
        const arrived = at !== null && at <= position;
        must(`#split-${agent}-${sector}`).textContent = arrived ? time(at) : "—";
        const button = must<HTMLButtonElement>(`[data-sector="${agent}:${sector}"]`);
        button.disabled = !arrived;
        button.classList.toggle("complete", arrived);
      }
      must(`#events-${agent}`).innerHTML = lane.length
        ? lane.slice(-2).map(eventButton).join("")
        : `<p class="waiting">${recording.events.length ? "Waiting for the first observed event. Startup counts." : "No agent events in this recording."}</p>`;
    }
    const gap = sectorGap(recording, position);
    for (const agent of agents)
      must(`#rank-${agent}`).textContent = gap
        ? gap.leader
          ? gap.leader === agent
            ? "1"
            : "2"
          : "="
        : agent === "claude"
          ? "A"
          : "B";
    must("#gap-label").textContent = gap
      ? `${sectorNames[gap.sector].toUpperCase()} GAP`
      : "MATCHING SECTOR GAP";
    must("#gap").textContent = gap ? `${gap.leader ? "+" : ""}${time(gap.gap)}s` : "—";
    must("#gap-note").textContent = gap
      ? `${gap.leader ? `${agentNames[gap.leader]} ahead` : "Level"} at the same observed sector.`
      : "Only observed splits. No estimated progress.";
    const call = currentCall(calls, position);
    must("#call-text").textContent = recording.events.length
      ? call.text
      : "No agent events were captured. There is no play-by-play to reconstruct.";
    must("#call-time").textContent = formatTime(call.at);
    must("#call-source").textContent = recording.events.length
      ? `${call.rule} · OPEN EVIDENCE +`
      : "EMPTY RECORDING · NO COMMENTARY INVENTED";
    must<HTMLButtonElement>("#call-source").disabled = !recording.events.length;
    must("#booth").className = `booth ${call.tone}`;
    const filtered = seen.filter((e) => filter === "all" || e.kind === filter);
    must("#event-count").textContent = `${seen.length} / ${recording.events.length}`;
    must("#ledger").innerHTML = filtered.length
      ? filtered.map(eventButton).join("")
      : `<p class="empty-ledger">${filter === "all" ? "No events at this position. Play or move the clock." : "No matching events at this position. Choose All or move the clock."}</p>`;
    const verified = recording.results
      .filter((r) => r.verifiedAt !== null && r.verifiedAt <= position)
      .sort((a, b) => (a.verifiedAt ?? 0) - (b.verifiedAt ?? 0));
    const first = verified[0];
    must<HTMLElement>("#photo").hidden = !first;
    if (first) {
      const final = position >= recording.duration;
      must("#photo").innerHTML =
        `<div class="finish-pattern" aria-hidden="true"></div><div><span>PHOTO FINISH / ${time(first.verifiedAt ?? 0)}s</span><strong>${html(final && /tied|Incomplete/u.test(finishSummary(recording)) ? finishSummary(recording) : `${agentNames[first.agent]} · first verified`)}</strong><p class="photo-note">${final ? "Both hidden checks complete. The gap compares independent acceptance times." : "The other lane’s independent acceptance is still pending."}</p></div><button type="button" data-event="${first.agent}-acceptance">Proof +</button>`;
    }
  }
  renderPlayback();
  performance.measure("race-render", { start: renderStart, end: performance.now() });
}
function inspect(
  id: string,
  origin: HTMLElement | null = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null,
): void {
  const event = recording.events.find((e) => e.id === id && e.at <= position);
  if (!event) return;
  pause();
  focusOrigin = origin;
  selected = id;
  const patch = eventDiff(recording.events, event);
  must("#inspector-title").textContent =
    `${agentNames[event.agent]} / ${time(event.at)}s / ${event.kind.toUpperCase()}`;
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
  const call = calls.find((c) => c.eventId === id);
  must("#inspector-body").innerHTML =
    `<p class="evidence-rule">${html(call?.rule ?? "RECORDED EVENT")}</p>${
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
  must<HTMLElement>("#inspector").hidden = false;
  must<HTMLButtonElement>("#inspector-close").focus({ preventScroll: true });
  must("#inspector-body").scrollTop = 0;
  if (innerWidth < 760)
    must("#inspector").scrollIntoView({ block: "nearest", behavior: "instant" });
  else must("#race").scrollIntoView({ block: "start", behavior: "instant" });
}
function closeInspector(): void {
  if (!selected) return;
  must<HTMLElement>("#inspector").hidden = true;
  selected = null;
  if (focusOrigin?.isConnected) focusOrigin.focus();
  else must<HTMLButtonElement>("#play").focus();
}
function dialog(title: string, html: string, archive = false): number {
  pause();
  dialogVersion++;
  must("#dialog").classList.toggle("archive-dialog", archive);
  must("#dialog-title").textContent = title;
  must("#dialog-body").innerHTML = html;
  must<HTMLDialogElement>("#dialog").showModal();
  return dialogVersion;
}
function guide(): void {
  dialog(
    "How to watch",
    `<h2>Trace a line. Check signed bytes.</h2><p>The Flight recorder computes inferred information flow from this real archive. Choose any changed line in the final diff: earlier matching reads and command outputs light up. Select a graph node or edge to inspect its evidence. A missing match stays unlinked.</p><p>“Verify the recording” checks retrospective DSSE signatures and file digests with WebCrypto. “Change one byte” alters a copy of the signed payload, so verification fails. Original command times and separate output digests were not captured; all nine missing fields are signed as null and disclosed. Signing took place at import, not execution.</p><h3>Race replay</h3><p>The lanes replay real commands and changes on a shared clock. Playback starts at 8×; it never calls an agent. Choose 1× to watch in recorded time.</p><p>Sector splits are cumulative time from launch to the first observed file read, edit, test command and independently verified fix. A first test split includes failed tests. The gap compares the latest sector both lanes have completed, never an estimate of code progress.</p><h3>Claim checks from receipts</h3><dl class="verdict-guide"><dt>VERIFIED</dt><dd>A matching command passed on current code.</dd><dt>STALE</dt><dd>Code changed after the matching command.</dd><dt>FAILED</dt><dd>The matching command failed.</dd><dt>UNBACKED</dt><dd>No adequate matching command evidence.</dd></dl><p>Unsupported wording may stay a plain message. The hidden acceptance check is independent of receipts. No commentary line implies that receipts inspected a hidden test.</p><p><strong>Keyboard:</strong> Space plays/pauses; left/right move five seconds. Tab reaches all controls, sector splits and event marks. Escape closes inline evidence; dialogs restore focus. Reduced motion starts paused and removes transitions.</p>`,
  );
}
function provenance(): void {
  dialog(
    "Recording & privacy",
    `<h2>Real recording. Unedited events.</h2><dl class="provenance"><dt>Source</dt><dd>Headless Claude Code and Codex CLI streams</dd><dt>Recorded</dt><dd>${html(recording.recordedAt)}</dd><dt>Record ID</dt><dd>${html(recording.id)}</dd><dt>Scrub check</dt><dd>${recording.scrub.pathsRedacted} path references replaced; zero findings</dd><dt>Timing</dt><dd>Monotonic stream-arrival timestamps. Hidden checks run after each agent exits. Provider startup/shutdown and local checking count.</dd></dl><p>${recording.challenge === "single-flight" ? "The original shell heredoc failure and recovery remain visible. Codex’s final wording has no receipts verdict; its independent hidden test result is recorded separately." : "This earlier attempt is an incomplete comparison. Original startup/tool failures and any captured acceptance result remain disclosed; it is not a fair ranking."}</p><p>No new race was recorded for this viewer redesign.</p><a href="/recordings/${archiveChoice?.file ?? "demo.json"}" download>Download original scrubbed JSON</a>`,
  );
}
async function history(): Promise<void> {
  const request = dialog(
    "Earlier attempts",
    "<h2>Opening the race archive…</h2><p>Failures remain on the record.</p>",
    true,
  );
  try {
    const response = await fetch("/race-history.json");
    if (!response.ok) throw new Error("unavailable");
    const raw: unknown = await response.json();
    if (request !== dialogVersion || !must<HTMLDialogElement>("#dialog").open) return;
    const archive = ArchiveSchema.parse(raw);
    must("#dialog-body").innerHTML =
      `<h2>Every attempt stays disclosed.</h2><p>Two original startup failures, a scrub-rejected attempt and the fair default recording. The rejected recording was discarded; only its <a href="/rejected-attempts.txt">terminal failure report</a> remains.</p><div class="archive-list">${archive.recordings.map((r) => `<article><span>${html(r.recordedAt)}${r.current ? " · DEFAULT REPLAY" : ""}</span><h3 class="archive-title">${html(r.title)}</h3><strong>${r.fair ? "Both agents accepted" : "Incomplete comparison"}</strong>${r.results.map((result) => `<p>${agentNames[result.agent]}: ${result.error ? "execution failed" : result.accepted ? "acceptance passed" : "acceptance failed"}${result.verifiedAt !== null ? ` · ${time(result.verifiedAt)}s` : ""}</p>`).join("")}<a href="/recordings/${encodeURIComponent(r.file)}" download>Original JSON</a></article>`).join("")}</div>`;
  } catch {
    if (request !== dialogVersion || !must<HTMLDialogElement>("#dialog").open) return;
    must("#dialog-body").innerHTML =
      "<h2>The archive is unavailable.</h2><p>Restore the local race-history.json file and reopen Earlier attempts.</p>";
  }
}
document.addEventListener("keydown", (e) => {
  if (must<HTMLDialogElement>("#dialog").open) return;
  if (e.key === "Escape" && selected) {
    closeInspector();
    return;
  }
  if (e.target instanceof Element && e.target.closest("#inspector")) return;
  if (!must<HTMLElement>("#flight").hidden) return;
  if (
    !recording?.events.length ||
    (e.target instanceof HTMLElement && /INPUT|SELECT|BUTTON|TEXTAREA|A/u.test(e.target.tagName))
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    toggle();
  }
  if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
    e.preventDefault();
    pause();
    closeInspector();
    seek(position + (e.code === "ArrowLeft" ? -5000 : 5000));
  }
});
reduced.addEventListener("change", () => {
  if (reduced.matches && recording) pause();
});
app.addEventListener(
  "click",
  (e) => {
    if (e.target instanceof Element)
      e.target.closest<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  },
  true,
);
app.addEventListener("click", onAction);
void load();
