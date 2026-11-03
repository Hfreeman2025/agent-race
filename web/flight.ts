import { agentNames, isRead, isTest, testOutcome } from "../src/core/broadcast";
import type { Agent, RaceEvent, Recording } from "../src/core/schema";
import {
  backwardSlice,
  buildTrace,
  type ChangedLine,
  type FinalFile,
  finalFiles,
  traceTicks,
} from "../src/core/trace";
import { baselines } from "./baselines";
import { escapeHtml as h } from "./escape";
import { mountProof } from "./proof";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected recorded fixture / trace node missing");
  return value;
}

const seconds = (at: number) => `${(at / 1000).toFixed(3)}s`;
const nodeLabel = (e: RaceEvent) =>
  e.phase === "acceptance"
    ? "ACCEPT"
    : e.kind === "edit"
      ? "EDIT"
      : e.kind === "claim"
        ? "CLAIM"
        : isRead(e)
          ? "READ"
          : isTest(e)
            ? "TEST"
            : "RUN";
const shortLabel = (e: RaceEvent) =>
  e.kind === "edit"
    ? e.title.replace("<repo>/", "")
    : e.phase === "acceptance"
      ? e.exitCode === 0
        ? "hidden tests passed"
        : "hidden tests failed"
      : isRead(e)
        ? "source + tests"
        : e.kind === "claim"
          ? "tests pass"
          : isTest(e)
            ? testOutcome(e) === "failed"
              ? "inner test failed"
              : "tests pass"
            : e.title.includes("wc -c")
              ? "0-byte files"
              : "repo command";
export function mountFlight(
  root: HTMLElement,
  recording: Recording,
  originalBytes: Uint8Array<ArrayBuffer>,
): void {
  const started = performance.now();
  const trace = buildTrace(recording);
  const ticks = traceTicks(recording.duration);
  const files = finalFiles(recording, baselines[recording.challenge] ?? {});
  const changed = files.flatMap((file) => file.lines.filter((line) => line.kind !== "context"));
  const linked = changed.filter(
    (line) => backwardSlice(trace, line.eventId, line.text).edges.size > 0,
  ).length;
  let agent: Agent = files.some((file) => file.agent === "codex")
    ? "codex"
    : files.some((file) => file.agent === "claude")
      ? "claude"
      : "codex";
  let path = "src.mjs";
  let criterion: ChangedLine | undefined;
  let selection = trace.nodes.at(-1)?.id ?? "";
  let showAll = false;
  const must = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Flight recorder missing ${selector}`);
    return element;
  };
  root.innerHTML = `<div class="flight-heading"><div><span class="flight-kicker">FLIGHT RECORDER <span>/ ${recording.events.length} RECORDED EVENTS</span></span><h2>${trace.nodes.length ? "Causal trace" : "No captured tool calls"}</h2></div><div class="flight-clock"><span id="trace-clock">44.034<span>s</span></span><p>SELECTED EVENT / FROM LAUNCH</p></div></div>
  <div class="trace-bar"><p><strong>INFERRED INFORMATION FLOW</strong><span>Computed here from the unedited recording · ${new Date(recording.recordedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</span></p><button type="button" id="trace-all" aria-pressed="false">Show all connections</button></div>
  <div class="trace-criterion"><span>SELECTED LINE</span><code id="trace-criterion">values.set(key, pending);</code><span id="trace-origin">READ 09 → EDIT 14 · INFERRED</span></div><div class="trace-scroll" tabindex="0" aria-label="Time graph; scroll horizontally on small screens"><div id="trace-graph" class="trace-graph"><div class="trace-ruler">${ticks.map((n) => `<span data-tick="${n}">${Number((n / 1000).toFixed(3))}s</span>`).join("")}</div><svg id="trace-edges" viewBox="0 0 1000 310" preserveAspectRatio="none" role="group" aria-label="Inferred connections; each opens its evidence"></svg>${(["claude", "codex"] as const).map((a) => `<div class="trace-lane ${a}"><div class="trace-lane-label"><strong>${agentNames[a]}</strong><span>${!trace.nodes.length ? "NO EVENT EVIDENCE" : recording.results.find((r) => r.agent === a)?.accepted ? "HIDDEN CHECK PASSED" : "NO ACCEPTED FIX"}</span></div></div>`).join("")}<div id="trace-nodes"></div></div></div>
  <div class="trace-caption"><span><i class="trace-key"></i>Observed tool call</span><span><i class="trace-key connection"></i>Inferred connection · select to inspect</span><span id="trace-count"></span></div>
  <div class="trace-call"><span>RECONSTRUCTION</span><div><strong id="trace-headline">Where did this line come from?</strong><p id="trace-summary">Choose a changed line. Matching identifiers and captured output light the path back.</p></div><button type="button" id="proof-open">Verify the recording +</button></div>
  <div class="trace-workbench"><section class="final-patch" aria-labelledby="final-patch-title"><div class="patch-heading"><h3 id="final-patch-title">Final diff</h3><div role="group" aria-label="Agent final diff"><button type="button" data-agent="claude" aria-pressed="false">Claude Code</button><button type="button" data-agent="codex" aria-pressed="true">Codex</button></div></div><div class="patch-file"><select id="trace-file" aria-label="Changed file"></select><span>SELECT ANY + / − LINE</span></div><div id="final-lines" class="final-lines"></div><p class="trace-foot">Rebuilt from the known challenge baseline and captured patches. Lines without a lexical match stay unlinked.</p></section>
  <section class="flow-evidence" aria-labelledby="flow-evidence-title"><div class="patch-heading"><h3 id="flow-evidence-title">Evidence for this connection</h3><span id="evidence-count"></span></div><div id="flow-evidence"></div></section></div>
  <section id="flight-proof" class="flight-proof" aria-label="Cryptographic verification"><div><span class="flight-kicker">INDEPENDENT OF THE GRAPH</span><h3>Check the bytes.</h3><p>Signatures and file digests are verified with WebCrypto on this device. An inferred connection never becomes a cryptographic proof of causality.</p><div id="proof-wire" class="proof-wire" aria-label="Signed message bytes"></div></div><div id="proof-body"><strong>Opening signed import…</strong><p>Original receipt verdicts remain distinct from cryptographic verification.</p></div></section>
  <details class="trace-method"><summary>What this graph can—and cannot—tell you</summary><p>A backward provenance slice starts at a changed line, finds earlier captured outputs with matching identifiers or whole lines, and walks those inferred connections back. It never reads an agent’s private reasoning. Common language tokens are excluded; no connection crosses lanes or travels back from a future event.</p><p>File-to-test links infer a dependency from a changed file and the recorded test command. Claude’s claim maps to its nearest earlier successful verify run; that mapping is inferred because the event does not store a receipt-to-command ID. Codex’s “Verification passed” wording had no recorded receipt verdict and stays unannotated in replay.</p><p><strong>Coverage: ${linked}/${changed.length} changed lines</strong> have at least one earlier lexical match in this recording. This measures overlap, not causal accuracy. The other ${changed.length - linked} remain unlinked. Actual causal accuracy is unknown.</p><p>This is a lexical provenance heuristic inspired by <a href="https://doi.org/10.5555/800078.802557">Weiser’s program slicing (1981)</a>, not dynamic program slicing or proof that the agent used a particular fact. All edge evidence is inspectable. No new agent run or model call takes place here.</p></details>`;

  const coordinates = new Map<string, { x: number; y: number }>();
  const graphWidth = Math.max(650, must("#trace-graph").clientWidth);
  const nodeHalf = (39 * 1000) / graphWidth;
  const rowEnds: Record<Agent, number[]> = {
    claude: [-100, -100, -100, -100],
    codex: [-100, -100, -100, -100],
  };
  for (const e of trace.nodes) {
    const lane = e.agent === "claude" ? 0 : 1;
    const x = 95 + (e.at / recording.duration) * 845;
    const offset = Math.max(
      0,
      rowEnds[e.agent].findIndex((end) => end < x - nodeHalf),
    );
    rowEnds[e.agent][offset] = x + nodeHalf;
    const y = lane * 145 + 48 + offset * 29;
    coordinates.set(e.id, { x, y });
  }
  for (const tick of root.querySelectorAll<HTMLElement>("[data-tick]"))
    tick.style.left = `${9.5 + (Number(tick.dataset.tick) / recording.duration) * 84.5}%`;
  must("#trace-nodes").innerHTML = trace.nodes
    .map(
      (e, i) =>
        `<button type="button" class="trace-node ${e.agent} ${isTest(e) && testOutcome(e) === "failed" ? "failed" : ""}" data-node="${h(e.id)}" aria-label="${h(`${agentNames[e.agent]} ${nodeLabel(e)} #${i + 1}, ${seconds(e.at)}, ${shortLabel(e)}`)}"><span>${nodeLabel(e)}</span><b>${String(i + 1).padStart(2, "0")}</b><span class="node-tip">${h(shortLabel(e))} · ${seconds(e.at)}</span></button>`,
    )
    .join("");
  for (const e of trace.nodes) {
    const p = required(coordinates.get(e.id));
    const button = must(`[data-node="${e.id}"]`);
    button.style.left = `${p.x / 10}%`;
    button.style.top = `${p.y}px`;
  }
  must("#trace-edges").innerHTML =
    `<g aria-hidden="true">${ticks
      .map((n) => {
        const x = 95 + (n / recording.duration) * 845;
        return `<line x1="${x}" y1="0" x2="${x}" y2="310" stroke="#2c3327" stroke-width="1" />`;
      })
      .join("")}</g>` +
    trace.edges
      .map((edge) => {
        const a = required(coordinates.get(edge.from));
        const b = required(coordinates.get(edge.to));
        return `<path data-edge="${h(edge.id)}" data-flow="${h(edge.to)}" role="button" tabindex="0" aria-label="${h(`Inferred connection ${edge.from} to ${edge.to}; inspect evidence`)}" d="M ${a.x} ${a.y + 13} C ${a.x + (b.x - a.x) * 0.45} ${a.y + 13}, ${b.x - (b.x - a.x) * 0.45} ${b.y + 13}, ${b.x} ${b.y + 13}"><title>${h(`INFERRED: ${edge.from} → ${edge.to}: ${edge.evidence.map((e) => e.value).join(", ")}`)}</title></path>`;
      })
      .join("");
  function currentFile(): FinalFile | undefined {
    return files.find((f) => f.agent === agent && f.path === path);
  }
  function renderFiles(): void {
    for (const button of root.querySelectorAll<HTMLElement>("[data-agent]"))
      button.setAttribute("aria-pressed", String(button.dataset.agent === agent));
    const available = files.filter((f) => f.agent === agent);
    must<HTMLSelectElement>("#trace-file").disabled = !available.length;
    if (!available.some((f) => f.path === path)) path = available[0]?.path ?? "";
    must<HTMLSelectElement>("#trace-file").innerHTML = available
      .map((f) => `<option>${h(f.path)}</option>`)
      .join("");
    must<HTMLSelectElement>("#trace-file").value = path;
    const file = currentFile();
    must("#final-lines").innerHTML = file?.error
      ? `<p class="trace-empty">${h(file.error)}</p>`
      : file?.lines.length
        ? file.lines
            .map((line) =>
              line.kind === "context"
                ? `<div class="patch-line context"><span>${line.next ?? line.old ?? ""}</span><code> ${h(line.text)}</code></div>`
                : `<button type="button" class="patch-line ${line.kind}" data-line="${h(line.id)}" aria-pressed="false"><span>${line.next ?? line.old ?? ""}</span><code>${line.kind === "added" ? "+" : "−"}${h(line.text)}</code></button>`,
            )
            .join("")
        : '<p class="trace-empty">No captured final changes for this file.</p>';
    criterion =
      file?.lines.find((l) => l.kind === "added" && /\.set\(/u.test(l.text)) ??
      file?.lines.find((l) => l.kind !== "context");
    if (criterion) selection = criterion.eventId;
    renderSelection();
  }
  function renderSelection(): void {
    const slice = backwardSlice(trace, selection, criterion?.text);
    const event = trace.nodes.find((e) => e.id === selection);
    must("#trace-clock").innerHTML = event ? `${(event.at / 1000).toFixed(3)}<span>s</span>` : "—";
    for (const button of root.querySelectorAll<HTMLElement>("[data-node]")) {
      const id = button.dataset.node ?? "";
      button.classList.toggle("lit", slice.nodes.has(id));
      button.classList.toggle("selected", id === selection);
      button.setAttribute("aria-pressed", String(id === selection));
    }
    for (const edge of root.querySelectorAll<SVGElement>("[data-edge]")) {
      edge.classList.toggle("lit", slice.edges.has(edge.dataset.edge ?? ""));
      edge.classList.toggle("all", showAll);
    }
    for (const line of root.querySelectorAll<HTMLElement>("[data-line]"))
      line.setAttribute("aria-pressed", String(line.dataset.line === criterion?.id));
    const active = trace.edges.filter((e) => slice.edges.has(e.id));
    must("#trace-count").textContent =
      `${trace.nodes.length} calls / claims · ${trace.edges.length} inferred connections`;
    must("#trace-criterion").textContent =
      criterion?.text.trim() ?? event?.title.split("\n")[0] ?? "Select a recorded event";
    must("#trace-origin").textContent =
      `${slice.nodes.size} OBSERVED NODES · ${slice.edges.size} INFERRED LINKS`;
    if (innerWidth < 760) {
      const p = coordinates.get(selection);
      const scroller = must(".trace-scroll");
      if (p)
        scroller.scrollLeft = Math.max(
          0,
          (p.x / 1000) * must("#trace-graph").clientWidth - scroller.clientWidth / 2,
        );
    }
    must("#evidence-count").textContent =
      `${active.length} ${active.length === 1 ? "link" : "links"}`;
    must("#trace-headline").textContent = criterion
      ? `${agentNames[agent]} · ${path}:${criterion.next ?? criterion.old}`
      : `${event ? agentNames[event.agent] : "Selected"} · ${event ? shortLabel(event) : "event"}`;
    must("#trace-summary").textContent = !trace.nodes.length
      ? "No tool calls were captured. There is no trace to infer. Recording outcomes remain in replay."
      : active.length
        ? `${slice.nodes.size} observed calls connected by ${active.length} inferred ${active.length === 1 ? "link" : "links"}. The shared text is below.`
        : "No matching earlier evidence. This line stays unlinked; absence is not proof it was invented.";
    const raw = event
      ? `<details class="trace-raw"><summary>Original ${nodeLabel(event).toLowerCase()} · ${h(event.id)} · ${seconds(event.at)}</summary><pre>${h(event.title)}${event.detail && event.detail !== event.title ? `\n\n${h(event.detail)}` : ""}${event.diff ? `\n\n${h(event.diff)}` : ""}</pre>${event.claims?.map((c) => `<p><strong>${c.verdict}</strong> · ${h(c.reason)}${c.receiptId ? ` · ${h(c.receiptId)}` : ""}</p>`).join("") ?? ""}</details>`
      : "";
    must("#flow-evidence").innerHTML =
      raw +
      (active.length
        ? active
            .map((edge) => {
              const source = required(trace.nodes.find((e) => e.id === edge.from));
              const target = required(trace.nodes.find((e) => e.id === edge.to));
              const matches =
                criterion && edge.to === selection
                  ? edge.evidence.filter((e) =>
                      e.kind === "line"
                        ? e.value === criterion?.text.trim()
                        : e.kind === "identifier" &&
                          new Set(criterion?.text.match(/\b\w+\b/gu)).has(e.value),
                    )
                  : edge.evidence;
              return `<article class="edge-evidence"><div class="edge-heading"><strong>INFERRED</strong><span>${h(edge.from)} → ${h(edge.to)}</span></div><p>${matches.some((e) => e.kind === "identifier") ? "The same identifier appears in both captured texts." : matches.some((e) => e.kind === "line") ? "The same whole line appears in both captured texts." : "Recorded command / file association. Mapping is inferred."}</p>${matches
                .slice(0, 4)
                .map(
                  (e) =>
                    `<div class="evidence-pair"><strong>${h(e.value)}</strong><div><span>${nodeLabel(source)} · ${seconds(source.at)}</span><pre>${h(e.source)}</pre></div><div><span>${nodeLabel(target)} · ${seconds(target.at)}</span><pre>${h(criterion && edge.to === selection ? criterion.text.trim() : e.target)}</pre></div></div>`,
                )
                .join("")}${
                matches.length > 4
                  ? `<details><summary>${matches.length - 4} more matching identifiers / lines</summary>${matches
                      .slice(4)
                      .map(
                        (e) =>
                          `<p><code>${h(e.value)}</code> — ${h(e.source)} / ${h(e.target)}</p>`,
                      )
                      .join("")}</details>`
                  : ""
              }</article>`;
            })
            .join("")
        : '<div class="trace-empty"><strong>No lexical connection found.</strong><p>Try a line containing <code>values</code>, <code>load</code> or <code>createCache</code>. New identifiers such as <code>pending</code> have no earlier occurrence in the captured output.</p></div>');
  }
  root.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const flow = e.target.closest<SVGElement>("[data-flow]");
    if (flow?.dataset.flow) {
      selection = flow.dataset.flow;
      criterion = undefined;
      renderSelection();
    }
    const button = e.target.closest<HTMLButtonElement>("button");
    if (button?.dataset.node) {
      selection = button.dataset.node;
      criterion = undefined;
      renderSelection();
    }
    if (button?.dataset.line) {
      criterion = currentFile()?.lines.find((l) => l.id === button.dataset.line);
      if (criterion) selection = criterion.eventId;
      renderSelection();
    }
    if (button?.dataset.agent === "claude" || button?.dataset.agent === "codex") {
      agent = button.dataset.agent;
      for (const b of root.querySelectorAll<HTMLElement>("[data-agent]"))
        b.setAttribute("aria-pressed", String(b === button));
      renderFiles();
    }
  });
  root.addEventListener("keydown", (e) => {
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target instanceof SVGElement &&
      e.target.dataset.flow
    ) {
      e.preventDefault();
      selection = e.target.dataset.flow;
      criterion = undefined;
      renderSelection();
    }
  });
  must<HTMLSelectElement>("#trace-file").addEventListener("change", (e) => {
    if (e.target instanceof HTMLSelectElement) {
      path = e.target.value;
      renderFiles();
    }
  });
  must<HTMLButtonElement>("#trace-all").disabled = !trace.edges.length;
  must("#trace-all").addEventListener("click", () => {
    showAll = !showAll;
    must("#trace-all").setAttribute("aria-pressed", String(showAll));
    must("#trace-all").textContent = showAll ? "Show selected chain" : "Show all connections";
    renderSelection();
  });
  must("#proof-open").addEventListener("click", () =>
    must("#flight-proof").scrollIntoView({ block: "start", behavior: "instant" }),
  );
  renderFiles();
  mountProof(must("#proof-body"), recording, originalBytes);
  performance.measure("trace-compute-and-mount", { start: started, end: performance.now() });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => performance.mark("flight-meaningful-paint")),
  );
}
