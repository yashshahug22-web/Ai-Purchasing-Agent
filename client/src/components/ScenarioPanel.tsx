import { ScenarioSnapshot } from "../types";

export function ScenarioPanel({ scenario }: { scenario: ScenarioSnapshot }) {
  const incumbent = scenario.suppliers.find((s) => s.conditionChange);
  const alternate = scenario.suppliers.find((s) => !s.conditionChange);
  const maxForecast = Math.max(...scenario.demandForecast.weeklyForecastCases);

  return (
    <div className="panel scenario-panel">
      <div className="panel-header">
        <span className="panel-eyebrow">Trigger event</span>
        <h2>{scenario.product.name}</h2>
        <div className="panel-subtle mono">
          {scenario.product.sku} · {scenario.product.fulfillmentNode}
        </div>
      </div>

      {incumbent?.conditionChange && (
        <div className="callout callout-amber">
          <div className="callout-title">Supplier condition change</div>
          <div className="callout-body">
            <strong>{incumbent.name}</strong> raised price by{" "}
            <strong>{incumbent.conditionChange.priceChangePct}%</strong> (
            <span className="mono">
              ${incumbent.previousPricePerCase?.toFixed(2)} → ${incumbent.pricePerCase.toFixed(2)}
            </span>
            ) and raised MOQ from{" "}
            <span className="mono">
              {incumbent.conditionChange.moqChangeFrom} → {incumbent.conditionChange.moqChangeTo} cases
            </span>
            . {incumbent.conditionChange.reason}.
          </div>
        </div>
      )}

      <div className="callout callout-red">
        <div className="callout-title">Upstream recommendation (unverified)</div>
        <div className="callout-body">
          "{scenario.upstreamRecommendation.rationale}"
          <div className="panel-subtle" style={{ marginTop: 6 }}>
            {scenario.upstreamRecommendation.warning}
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="On hand" value={`${scenario.inventory.onHandCases} cases`} />
        <Stat label="Reorder point" value={`${scenario.inventory.reorderPointCases} cases`} />
        <Stat
          label="Days of stock left"
          value={`${scenario.inventory.daysOfStockLeft}d`}
          warn={scenario.inventory.belowReorderPoint}
        />
        <Stat label="Free storage" value={`${scenario.warehouse.freeCapacityCases} cases`} />
        <Stat label="Budget remaining" value={`$${scenario.budget.remainingUsd.toLocaleString()}`} />
        <Stat label="Existing open POs" value={`${scenario.existingPurchaseOrders.filter(p => p.status !== "delivered").length}`} />
      </div>

      <div className="section-label">4-week demand forecast</div>
      <div className="forecast-bars">
        {scenario.demandForecast.weeklyForecastCases.map((v, i) => (
          <div className="forecast-col" key={i}>
            <div className="forecast-bar" style={{ height: `${(v / maxForecast) * 100}%` }} />
            <div className="forecast-label mono">{v}</div>
            <div className="forecast-week">W{i + 1}</div>
          </div>
        ))}
      </div>
      <div className="panel-subtle">{scenario.demandForecast.note}</div>

      <div className="section-label">Suppliers</div>
      <div className="supplier-table">
        {scenario.suppliers.map((s) => (
          <div className="supplier-row" key={s.supplierId}>
            <div className="supplier-name">
              {s.name}
              <span className={`tag ${s.relationship === "incumbent" ? "tag-amber" : "tag-blue"}`}>
                {s.relationship === "incumbent" ? "incumbent" : "alternate"}
              </span>
            </div>
            <div className="supplier-meta mono">
              ${s.pricePerCase.toFixed(2)}/case · MOQ {s.moqCases} · lead {s.leadTimeDays}d
              {s.volumeDiscount && (
                <span className="panel-subtle">
                  {" "}
                  · {s.volumeDiscount.discountPct}% off at {s.volumeDiscount.minCases}+
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`stat ${warn ? "stat-warn" : ""}`}>
      <div className="stat-value mono">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
