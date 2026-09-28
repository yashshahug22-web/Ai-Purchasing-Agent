import { useEffect, useState } from "react";
import { fetchScenario, runAgent } from "./api";
import { AgentRunResult, ScenarioSnapshot } from "./types";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { TraceLog } from "./components/TraceLog";
import { OutcomePanel } from "./components/OutcomePanel";
import "./styles/global.css";
import "./styles/App.css";

export default function App() {
  const [scenario, setScenario] = useState<ScenarioSnapshot | null>(null);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScenario = () => {
    fetchScenario()
      .then(setScenario)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadScenario();
  }, []);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await runAgent();
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    loadScenario();
  };

  if (!scenario) {
    return (
      <div className="app-loading">
        {error ? (
          <div className="callout callout-red" style={{ maxWidth: 480 }}>
            <div className="callout-title">Couldn't reach the backend</div>
            <div className="callout-body mono">{error}</div>
            <div className="panel-subtle" style={{ marginTop: 8 }}>
              Make sure the server is running on port 4000 (see README).
            </div>
          </div>
        ) : (
          "Loading scenario…"
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-eyebrow">AI Purchasing Agent</div>
          <h1>Buyer Console</h1>
        </div>
        <div className="app-header-right">
          <span className={`mode-badge ${scenario.provider === "rule_based" ? "mode-rule" : "mode-llm"}`}>
            {scenario.provider === "gemini" && "Gemini tool-use agent"}
            {scenario.provider === "claude" && "Claude tool-use agent"}
            {scenario.provider === "rule_based" && "Rule-based agent (no API key set)"}
          </span>
          <button className="btn btn-ghost" onClick={handleReset} disabled={running}>
            Reset
          </button>
          <button className="btn btn-primary" onClick={handleRun} disabled={running}>
            {running ? "Running…" : "Run agent"}
          </button>
        </div>
      </header>

      {error && (
        <div className="callout callout-red app-error">
          <div className="callout-title">Agent run failed</div>
          <div className="callout-body mono">{error}</div>
        </div>
      )}

      <div className="app-grid">
        <ScenarioPanel scenario={scenario} />
        <TraceLog trace={result?.trace ?? []} running={running} />
        <OutcomePanel result={result} scenario={scenario} />
      </div>
    </div>
  );
}
