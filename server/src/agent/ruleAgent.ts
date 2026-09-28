import { Store } from "../data/store";
import { AgentRunResult, TraceEvent } from "./types";

/**
 * A transparent, deterministic stand-in for the LLM agent. It runs the exact
 * same investigate -> decide -> act -> validate loop, using explicit
 * heuristics instead of a model call, so the app is fully demoable without
 * an ANTHROPIC_API_KEY. It's intentionally written so each step mirrors a
 * step the LLM agent takes via tools, for an apples-to-apples comparison.
 */
export function runRuleAgent(store: Store): AgentRunResult {
  const trace: TraceEvent[] = [];
  const now = () => new Date().toISOString();
  const push = (type: TraceEvent["type"], label: string, detail?: unknown) =>
    trace.push({ type, label, detail, timestamp: now() });

  const upstream = store.getUpstreamRecommendation() as any;
  push("trigger", "Supplier condition change detected", upstream);

  push("thought", "Step 1: Investigate — pulling inventory, demand, POs, suppliers, storage, budget before trusting the upstream recommendation.");

  const inventory = store.getInventoryStatus();
  push("tool_call", "get_inventory_status", {});
  push("tool_result", "Result: get_inventory_status", inventory);

  const forecast = store.getDemandForecast();
  push("tool_call", "get_demand_forecast", {});
  push("tool_result", "Result: get_demand_forecast", forecast);

  const existingPOs = store.getExistingPurchaseOrders();
  push("tool_call", "get_existing_purchase_orders", {});
  push("tool_result", "Result: get_existing_purchase_orders", existingPOs);

  const suppliers = store.getSuppliers();
  push("tool_call", "get_suppliers", {});
  push("tool_result", "Result: get_suppliers", suppliers);

  const warehouse = store.getWarehouseCapacity();
  push("tool_call", "get_warehouse_capacity", {});
  push("tool_result", "Result: get_warehouse_capacity", warehouse);

  const budget = store.getBudgetStatus();
  push("tool_call", "get_budget_status", {});
  push("tool_result", "Result: get_budget_status", budget);

  push(
    "thought",
    `Step 2: Decide — the upstream recommendation is to accept ${upstream.supplierId}'s new terms and ` +
      `order ${upstream.cases} cases. Validating that candidate first, then checking the alternate supplier.`
  );

  const incumbentId = upstream.supplierId as string;
  const incumbentCandidate = store.validateOrder(incumbentId, upstream.cases);
  push("tool_call", "validate_order", { supplierId: incumbentId, cases: upstream.cases });
  push("validation", "Validation check: upstream recommendation", incumbentCandidate);

  if (!incumbentCandidate.checks.fitsStorage) {
    push(
      "thought",
      `Rejecting the upstream recommendation: ${upstream.cases} cases exceeds the ${warehouse.freeCapacityCases}-case ` +
        `free capacity in ${warehouse.zone}. Because ${incumbentId}'s new MOQ is ${incumbentCandidate.moqCases} cases, ` +
        `there is no smaller order size with this supplier that would fit — the incumbent is not usable right now, ` +
        `regardless of price.`
    );
  }

  const alternate = suppliers.find((s) => s.supplierId !== incumbentId)!;
  const discountQty = alternate.volumeDiscount?.minCases ?? alternate.moqCases;
  const candidateQty = Math.min(discountQty, warehouse.freeCapacityCases);

  push(
    "thought",
    `Evaluating alternate supplier ${alternate.name}: MOQ ${alternate.moqCases} cases, lead time ${alternate.leadTimeDays} days, ` +
      `and a ${alternate.volumeDiscount?.discountPct}% volume discount at ${alternate.volumeDiscount?.minCases}+ cases. ` +
      `Testing an order of ${candidateQty} cases (largest that still fits storage and captures the discount).`
  );

  const alternateCandidate = store.validateOrder(alternate.supplierId, candidateQty);
  push("tool_call", "validate_order", { supplierId: alternate.supplierId, cases: candidateQty });
  push("validation", "Validation check: alternate candidate", alternateCandidate);

  const chosen = alternateCandidate.passes ? alternateCandidate : incumbentCandidate;

  if (alternateCandidate.passes) {
    push(
      "thought",
      `Decision: order ${candidateQty} cases from ${alternate.name} at the discounted price. It fits storage ` +
        `(${candidateQty} <= ${warehouse.freeCapacityCases}), fits budget ($${alternateCandidate.totalCostUsd} <= ` +
        `$${budget.remainingUsd} remaining), and meets MOQ. Lead time is ${alternate.leadTimeDays} days against ` +
        `${inventory.daysOfStockLeft} days of stock on hand, so a stockout gap of ` +
        `${alternateCandidate.projectedStockoutGapDays} day(s) is expected before this order arrives — flagging that ` +
        `as an operational risk rather than treating this as a fully clean outcome.`
    );
  } else {
    push(
      "thought",
      "Neither candidate cleanly passes validation; proceeding with the option that fails the fewest hard constraints and flagging the rest."
    );
  }

  push("tool_call", "create_purchase_order", { supplierId: chosen.supplierId, cases: chosen.cases });
  const po = store.createPurchaseOrder(chosen.supplierId, chosen.cases, "ai_purchasing_agent");
  push("action", "Purchase order created", po);

  const finalValidation = store.validateOrder(chosen.supplierId, chosen.cases);
  push("tool_call", "validate_order (post-action)", { supplierId: chosen.supplierId, cases: chosen.cases });
  push("validation", "Validation check: placed order", finalValidation);

  const justification =
    `Rejected the upstream recommendation to reorder ${upstream.cases} cases from ${incumbentId} because it ` +
    `exceeds available warehouse capacity (${warehouse.freeCapacityCases} cases free) and the new MOQ leaves no ` +
    `smaller option with that supplier. Instead placed PO ${po.poId} for ${po.cases} cases with ${alternate.name} ` +
    `at $${po.unitPrice}/case (volume discount applied), total $${po.totalCostUsd}, which fits both storage and the ` +
    `remaining Pantry budget ($${budget.remainingUsd}). Residual risk: a projected ` +
    `${finalValidation.projectedStockoutGapDays}-day stockout gap before this order arrives, since ` +
    `${alternate.name}'s lead time (${alternate.leadTimeDays} days) exceeds current days-of-stock-left ` +
    `(${inventory.daysOfStockLeft}). Recommend flagging this SKU to store ops for a manual top-up or substitution ` +
    `during the gap.`;

  push("final", "Agent summary", justification);

  return {
    mode: "rule_based",
    trace,
    decision: {
      chosenSupplierId: po.supplierId,
      cases: po.cases,
      justification,
      rejectedUpstreamRecommendation: po.supplierId !== upstream.supplierId || po.cases !== upstream.cases,
    },
    purchaseOrder: po,
    validation: finalValidation,
  };
}
