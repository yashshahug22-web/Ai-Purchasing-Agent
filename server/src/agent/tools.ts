import { Store } from "../data/store";

/** JSON-schema tool definitions handed to Claude's tool-use API. */
export const toolDefinitions = [
  {
    name: "get_inventory_status",
    description:
      "Get current on-hand stock, reorder point, average daily sales, and computed days-of-stock-left for the product.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_demand_forecast",
    description: "Get the weekly demand forecast for the next few weeks, including any known demand drivers (e.g. promos).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_existing_purchase_orders",
    description: "Get purchase orders already placed for this product, to avoid double-ordering.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_suppliers",
    description:
      "Get all suppliers who can fulfill this product, including price, MOQ, lead time, and any recent condition changes (price hikes, MOQ changes) or volume discounts.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_warehouse_capacity",
    description: "Get remaining physical storage capacity (in cases) for this product's storage zone.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_budget_status",
    description: "Get the remaining monthly purchasing budget for this product's category.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_upstream_recommendation",
    description:
      "Get the purchasing recommendation produced by the legacy rules engine that triggered this review. This recommendation is NOT guaranteed to be correct and should be independently verified.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "validate_order",
    description:
      "Check a candidate order (supplier + quantity) against hard constraints: MOQ, warehouse capacity, remaining budget, and whether it will arrive before the current stock runs out. Use this BEFORE placing an order, and may be called multiple times to compare candidate orders.",
    input_schema: {
      type: "object",
      properties: {
        supplierId: { type: "string" },
        cases: { type: "number" },
      },
      required: ["supplierId", "cases"],
    },
  },
  {
    name: "create_purchase_order",
    description:
      "Take action: place a real purchase order against a supplier for a given number of cases. Only call this once you have decided on a final supplier and quantity that passes validate_order.",
    input_schema: {
      type: "object",
      properties: {
        supplierId: { type: "string" },
        cases: { type: "number" },
      },
      required: ["supplierId", "cases"],
    },
  },
];

export function dispatchTool(store: Store, name: string, input: any): unknown {
  switch (name) {
    case "get_inventory_status":
      return store.getInventoryStatus();
    case "get_demand_forecast":
      return store.getDemandForecast();
    case "get_existing_purchase_orders":
      return store.getExistingPurchaseOrders();
    case "get_suppliers":
      return store.getSuppliers();
    case "get_warehouse_capacity":
      return store.getWarehouseCapacity();
    case "get_budget_status":
      return store.getBudgetStatus();
    case "get_upstream_recommendation":
      return store.getUpstreamRecommendation();
    case "validate_order":
      return store.validateOrder(input.supplierId, input.cases);
    case "create_purchase_order":
      return store.createPurchaseOrder(input.supplierId, input.cases, "ai_purchasing_agent");
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
