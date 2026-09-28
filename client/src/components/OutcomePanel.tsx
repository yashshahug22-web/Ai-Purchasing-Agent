import { AgentRunResult, ScenarioSnapshot } from "../types";

const CHECK_LABELS: Record<string, string> = {
  meetsMoq: "Meets supplier MOQ",
  fitsStorage: "Fits free warehouse capacity",
  withinBudget: "Within remaining budget",
  arrivesBeforeStockout: "Arrives before stock runs out",
};

export function OutcomePanel({
  result,
  scenario,
}: {
  result: AgentRunResult | null;
  scenario: ScenarioSnapshot;
}) {
  return (
    <div className="panel outcome-panel">
      <div className="panel-header">
        <span className="panel-eyebrow">Outcome</span>
        <h2>Decision, action & validation</h2>
      </div>

      {!result && <div className="trace-empty">No run yet.</div>}

      {result && (
        <>
          <div className={`decision-badge ${result.decision.rejectedUpstreamRecommendation ? "badge-red" : "badge-green"}`}>
            {result.decision.rejectedUpstreamRecommendation
              ? "Rejected upstream recommendation"
              : "Confirmed upstream recommendation"}
          </div>

          <div className="section-label">Purchase order placed</div>
          <div className="po-card">
            <div className="po-row">
              <span className="panel-subtle">PO ID</span>
              <span className="mono">{result.purchaseOrder.poId}</span>
            </div>
            <div className="po-row">
              <span className="panel-subtle">Supplier</span>
              <span>{scenario.suppliers.find((s) => s.supplierId === result.purchaseOrder.supplierId)?.name}</span>
            </div>
            <div className="po-row">
              <span className="panel-subtle">Quantity</span>
              <span className="mono">{result.purchaseOrder.cases} cases</span>
            </div>
            <div className="po-row">
              <span className="panel-subtle">Unit price</span>
              <span className="mono">${result.purchaseOrder.unitPrice.toFixed(2)}</span>
            </div>
            <div className="po-row po-total">
              <span className="panel-subtle">Total</span>
              <span className="mono">${result.purchaseOrder.totalCostUsd.toLocaleString()}</span>
            </div>
          </div>

          <div className="section-label">Validation</div>
          <div className="checklist">
            {Object.entries(result.validation.checks).map(([key, passed]) => (
              <div className={`check-row ${passed ? "check-pass" : "check-fail"}`} key={key}>
                <span className="check-icon">{passed ? "✓" : "✕"}</span>
                <span>{CHECK_LABELS[key] || key}</span>
              </div>
            ))}
          </div>

          {result.validation.projectedStockoutGapDays > 0 && (
            <div className="callout callout-amber">
              <div className="callout-title">Residual risk flagged</div>
              <div className="callout-body">
                Projected {result.validation.projectedStockoutGapDays}-day stockout gap before this order
                arrives — surfaced rather than hidden, since no available supplier could clear the gap
                entirely under current constraints.
              </div>
            </div>
          )}

          <div className="section-label">Agent justification</div>
          <div className="justification mono">{result.decision.justification}</div>
        </>
      )}
    </div>
  );
}
