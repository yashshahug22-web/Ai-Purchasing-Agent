export type TraceEventType =
  | "trigger"
  | "thought"
  | "tool_call"
  | "tool_result"
  | "decision"
  | "action"
  | "validation"
  | "final";

export interface TraceEvent {
  type: TraceEventType;
  label: string;
  detail?: unknown;
  timestamp: string;
}

export interface AgentRunResult {
  mode: "llm" | "rule_based";
  trace: TraceEvent[];
  decision: {
    chosenSupplierId: string;
    cases: number;
    justification: string;
    rejectedUpstreamRecommendation: boolean;
  };
  purchaseOrder: unknown;
  validation: unknown;
}
