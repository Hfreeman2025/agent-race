import { StringDecoder } from "node:string_decoder";
/** Incremental UTF-8 JSONL framing; chunks are not character or line boundaries. */
export class StreamLines {
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  constructor(private maxLine = 1_000_000) {}
  feed(chunk: Buffer): string[] {
    this.buffer += this.decoder.write(chunk);
    const lines: string[] = [];
    let end = this.buffer.indexOf("\n");
    while (end >= 0) {
      const line = this.buffer.slice(0, end);
      this.check(line);
      if (line.trim()) lines.push(line);
      this.buffer = this.buffer.slice(end + 1);
      end = this.buffer.indexOf("\n");
    }
    this.check(this.buffer);
    return lines;
  }
  finish(): string[] {
    this.buffer += this.decoder.end();
    this.check(this.buffer);
    const final = this.buffer;
    this.buffer = "";
    return final.trim() ? [final] : [];
  }
  private check(line: string): void {
    if (line.length > this.maxLine) throw new Error("Agent event exceeded 1 MB line limit");
  }
}
