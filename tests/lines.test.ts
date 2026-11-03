import { expect, it } from "vitest";
import { StreamLines } from "../src/harness/lines";

it("preserves split Unicode code points and an unterminated last event", () => {
  const input = '{"text":"東京 café"}\n{"text":"fin"}';
  const parser = new StreamLines();
  const lines: string[] = [];
  for (const byte of Buffer.from(input)) lines.push(...parser.feed(Buffer.from([byte])));
  expect(lines).toEqual(['{"text":"東京 café"}']);
  expect(parser.finish()).toEqual(['{"text":"fin"}']);
  expect(parser.finish()).toEqual([]);
});
it("enforces per-line limits even without a trailing newline", () => {
  expect(() => new StreamLines(5).feed(Buffer.from("123456"))).toThrow("line limit");
  expect(() => new StreamLines(5).feed(Buffer.from("123456\n"))).toThrow("line limit");
  const parser = new StreamLines(5);
  expect(parser.feed(Buffer.from("123\n456\n"))).toEqual(["123", "456"]);
});
