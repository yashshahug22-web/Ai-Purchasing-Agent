export interface Supplier {
  supplierId: string;
  name: string;
  relationship: string;
  pricePerCase: number;
  previousPricePerCase?: number;
  moqCases: number;
  previousMoqCases?: number;
  leadTimeDays: number;
  conditionChange?: {
    type: string;
    priceChangePct: number;
    moqChangeFrom: number;
    moqChangeTo: number;
    reason: string;
  };
  volumeDiscount?: {
    minCases: number;
    discountPct: number;
    discountedPricePerCase: number;
  };
}

export interface ScenarioSnapshot {
  product: { sku: string; name: string; category: string; unit: string; fulfillmentNode: string };
  inventory: {
    onHandCases: number;
    reorderPointCases: number;
    avgDailySalesCases: number;
    daysOfStockLeft: number;
    belowReorderPoint: boolean;
  };
  demandForecast: { weeklyForecastCases: number[]; totalForecastCases: number; note: string };
  existingPurchaseOrders: { poId: string; cases: number; status: string; deliveredAt?: string }[];
  suppliers: Supplier[];
  warehouse: { zone: string; freeCapacityCases: number };
  budget: { category: string; monthlyBudgetUsd: number; spentSoFarUsd: number; remainingUsd: number };
  upstreamRecommendation: {
    source: string;
    action: string;
    supplierId: string;
    cases: number;
    rationale: string;
    warning: string;
  };
  llmAvailable: boolean;
  provider: "gemini" | "claude" | "rule_based";
}

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

export interface ValidationResult {
  supplierId: string;
  cases: number;
  unitPrice: number;
  totalCostUsd: number;
  checks: {
    meetsMoq: boolean;
    fitsStorage: boolean;
    withinBudget: boolean;
    arrivesBeforeStockout: boolean;
  };
  freeCapacityCases: number;
  remainingBudgetUsd: number;
  moqCases: number;
  leadTimeDays: number;
  daysOfStockLeft: number;
  projectedStockoutGapDays: number;
  passes: boolean;
}

export interface PurchaseOrder {
  poId: string;
  sku: string;
  supplierId: string;
  cases: number;
  unitPrice: number;
  totalCostUsd: number;
  status: string;
  createdAt: string;
  createdBy: string;
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
  purchaseOrder: PurchaseOrder;
  validation: ValidationResult;
}
