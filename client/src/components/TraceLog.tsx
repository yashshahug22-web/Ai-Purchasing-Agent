import { useEffect, useRef } from "react";
import { TraceEvent } from "../types";

const TYPE_META: Record<TraceEvent["type"], { icon: string; className: string }> = {
  trigger: { icon: "◆", className: "trace-trigger" },
  thought: { icon: "·", className: "trace-thought" },
  tool_call: { icon: "→", className: "trace-tool-call" },
  tool_result: { icon: "←", className: "trace-tool-result" },
  decision: { icon: "◇", className: "trace-decision" },
  action: { icon: "✓", className: "trace-action" },
  validation: { icon: "▣", className: "trace-validation" },
  final: { icon: "■", className: "trace-final" },
};

export function TraceLog({ trace, running }: { trace: TraceEvent[]; running: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [trace.length]);

  return (
    <div className="panel trace-panel">
      <div className="panel-header">
        <span className="panel-eyebrow">Agent trace</span>
        <h2>Investigate → Decide → Act → Validate</h2>
      </div>

      <div className="trace-scroll">
        {trace.length === 0 && !running && (
          <div className="trace-empty">Run the agent to see it investigate, decide, act, and validate live.</div>
        )}

        {trace.map((event, i) => {
          const meta = TYPE_META[event.type];
          return (
            <div className={`trace-row ${meta.className}`} key={i}>
              <div className="trace-icon">{meta.icon}</div>
              <div className="trace-body">
                <div className="trace-label">{event.label}</div>
                {event.detail !== undefined && <TraceDetail detail={event.detail} />}
              </div>
            </div>
          );
        })}

        {running && (
          <div className="trace-row trace-pending">
            <div className="trace-icon">…</div>
            <div className="trace-body">
              <div className="trace-label">working</div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function TraceDetail({ detail }: { detail: unknown }) {
  if (typeof detail === "string") {
    return <div className="trace-text">{detail}</div>;
  }
  return <pre className="trace-json mono">{JSON.stringify(detail, null, 2)}</pre>;
}
