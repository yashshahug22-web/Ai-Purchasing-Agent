import { AgentRunResult, ScenarioSnapshot } from "./types";

export async function fetchScenario(): Promise<ScenarioSnapshot> {
  const res = await fetch("/api/scenario");
  if (!res.ok) throw new Error("Failed to load scenario");
  return res.json();
}

export async function runAgent(mode?: "gemini" | "claude" | "rule_based"): Promise<AgentRunResult> {
  const res = await fetch("/api/run-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Agent run failed");
  }
  return res.json();
}
