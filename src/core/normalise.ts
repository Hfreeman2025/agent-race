import { z } from "zod";
import { type Agent, EventSchema, type RaceEvent } from "./schema";

const ObjectSchema = z.record(z.string(), z.unknown());
const str = (x: unknown) => (typeof x === "string" ? x : "");
const obj = (x: unknown): Record<string, unknown> => ObjectSchema.safeParse(x).data ?? {};
export type Draft = Pick<RaceEvent, "kind" | "title"> &
  Partial<Pick<RaceEvent, "detail" | "diff" | "exitCode">>;
export function toolKind(name: string, command: string): RaceEvent["kind"] {
  if (/read|view|cat_file/i.test(name)) return "read";
  if (/search|grep|glob|find/i.test(name)) return "search";
  if (/edit|write|patch|file_change/i.test(name)) return "edit";
  if (/[;&|]|\$\(|`/.test(command)) return "run";
  if (/^(?:cat|head|tail|sed|ls|pwd)\b/.test(command.trim())) return "read";
  if (/^(?:rg|grep|find)\b/.test(command.trim())) return "search";
  return "run";
}
/** Unknown envelopes are ignored; recognized envelopes are structurally validated. */
export function normalise(agent: Agent, raw: unknown): Draft[] {
  const root = ObjectSchema.parse(raw);
  if (agent === "codex") {
    if (root.type === "item.completed") {
      const item = z.object({ type: z.string() }).passthrough().parse(root.item);
      if (item.type === "agent_message")
        return [{ kind: "message", title: str(item.text), detail: str(item.text) }];
      if (item.type === "command_execution") {
        const c = z
          .object({
            command: z.string(),
            aggregated_output: z.string(),
            exit_code: z.number().int().nullable(),
          })
          .parse(item);
        return [
          {
            kind: toolKind("command", c.command),
            title: c.command,
            detail: c.aggregated_output,
            exitCode: c.exit_code,
          },
        ];
      }
      if (item.type === "file_change") {
        const c = z
          .object({ changes: z.array(z.object({ path: z.string(), kind: z.string() })) })
          .parse(item);
        return c.changes.map((x) => ({
          kind: "edit",
          title: x.path,
          detail: `${x.kind} ${x.path}`,
        }));
      }
      if (item.type === "error")
        return [{ kind: "message", title: `Agent error: ${str(item.message)}` }];
    }
    if (root.type === "turn.failed") {
      const error = z.object({ message: z.string() }).parse(root.error);
      return [{ kind: "message", title: `Turn failed: ${error.message}` }];
    }
    if (root.type === "error")
      return [{ kind: "message", title: `Provider error: ${str(root.message)}` }];
    return [];
  }
  if (root.type === "assistant") {
    const m = z
      .object({ content: z.array(ObjectSchema) })
      .passthrough()
      .parse(root.message);
    return m.content.flatMap((b): Draft[] => {
      if (b.type === "text") {
        const text = z.string().parse(b.text);
        return [{ kind: "message", title: text, detail: text }];
      }
      if (b.type === "tool_use") {
        const input = obj(b.input);
        const name = z.string().parse(b.name);
        const cmd = str(input.command);
        const title = cmd || str(input.file_path) || str(input.path) || str(input.pattern) || name;
        const detail = /edit/i.test(name) ? JSON.stringify(input) : undefined;
        return [{ kind: toolKind(name, cmd), title, ...(detail ? { detail } : {}) }];
      }
      return [];
    });
  }
  if (root.type === "result" && root.is_error === true)
    return [{ kind: "message", title: `Agent error: ${str(root.result)}` }];
  return [];
}
export function makeEvent(agent: Agent, at: number, seq: number, draft: Draft): RaceEvent {
  return EventSchema.parse({ ...draft, agent, at, seq, id: `${agent}-${seq}`, phase: "agent" });
}
export function parseLine(line: string): unknown {
  const value: unknown = JSON.parse(line);
  return ObjectSchema.parse(value);
}
