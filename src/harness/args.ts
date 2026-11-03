import type { Agent } from "../core/schema";
/** Native approvals are disabled only inside the mandatory external Seatbelt policy. */
export function agentArgs(agent: Agent, prompt: string): string[] {
  return agent === "claude"
    ? [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--safe-mode",
        "--no-session-persistence",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--settings",
        '{"sandbox":{"enabled":false}}',
        "--tools",
        "Read,Edit,Write,Bash,Glob,Grep",
        "--dangerously-skip-permissions",
        "--max-budget-usd",
        "2",
        prompt,
      ]
    : [
        "exec",
        "--json",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--strict-config",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "-c",
        "features.memories=false",
        "-",
      ];
}

/** Keep stdin transport and argv together so a caller cannot accidentally drop the prompt. */
export function agentLaunch(agent: Agent, prompt: string): { args: string[]; input?: string } {
  return { args: agentArgs(agent, prompt), ...(agent === "codex" ? { input: prompt } : {}) };
}
