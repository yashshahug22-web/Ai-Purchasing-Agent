import fs from "fs";
import path from "path";

const DB_PATH = path.join(__dirname, "db.json");

export interface Supplier {
  supplierId: string;
  name: string;
  relationship: string;
  pricePerCase: number;
  previousPricePerCase?: number;
  moqCases: number;
  previousMoqCases?: number;
  leadTimeDays: number;
  conditionChange?: Record<string, unknown>;
  volumeDiscount?: {
    minCases: number;
    discountPct: number;
    discountedPricePerCase: number;
  };
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

interface Db {
  product: Record<string, unknown>;
  inventory: {
    onHandCases: number;
    reorderPointCases: number;
    avgDailySalesCases: number;
    lastCountedAt: string;
  };
  demandForecast: {
    horizonWeeks: number;
    weeklyForecastCases: number[];
    note: string;
  };
  existingPurchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  warehouse: { node: string; zone: string; freeCapacityCases: number };
  budget: {
    category: string;
    period: string;
    monthlyBudgetUsd: number;
    spentSoFarUsd: number;
  };
  upstreamRecommendation: Record<string, unknown>;
}

/** Loads a fresh copy of the mock dataset for each simulation run,
 * so re-running a scenario doesn't carry over state from a previous run. */
function loadFreshDb(): Db {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw) as Db;
}

export class Store {
  private db: Db;
  private poCounter = 1;

  constructor() {
    this.db = loadFreshDb();
  }

  getProduct() {
    return this.db.product;
  }

  getInventoryStatus() {
    const { onHandCases, reorderPointCases, avgDailySalesCases, lastCountedAt } =
      this.db.inventory;
    const daysOfStockLeft = Number((onHandCases / avgDailySalesCases).toFixed(1));
    return {
      onHandCases,
      reorderPointCases,
      avgDailySalesCases,
      daysOfStockLeft,
      belowReorderPoint: onHandCases < reorderPointCases,
      lastCountedAt,
    };
  }

  getDemandForecast() {
    const total = this.db.demandForecast.weeklyForecastCases.reduce((a, b) => a + b, 0);
    return { ...this.db.demandForecast, totalForecastCases: total };
  }

  getExistingPurchaseOrders() {
    return this.db.existingPurchaseOrders;
  }

  getSuppliers() {
    return this.db.suppliers;
  }

  getSupplier(supplierId: string) {
    const s = this.db.suppliers.find((s) => s.supplierId === supplierId);
    if (!s) throw new Error(`Unknown supplierId: ${supplierId}`);
    return s;
  }

  getWarehouseCapacity() {
    return this.db.warehouse;
  }

  getBudgetStatus() {
    const { monthlyBudgetUsd, spentSoFarUsd, category, period } = this.db.budget;
    return {
      category,
      period,
      monthlyBudgetUsd,
      spentSoFarUsd,
      remainingUsd: Number((monthlyBudgetUsd - spentSoFarUsd).toFixed(2)),
    };
  }

  getUpstreamRecommendation() {
    return this.db.upstreamRecommendation;
  }

  /** Effective unit price for a supplier at a given order quantity (applies volume discounts). */
  effectivePrice(supplierId: string, cases: number): number {
    const s = this.getSupplier(supplierId);
    if (s.volumeDiscount && cases >= s.volumeDiscount.minCases) {
      return s.volumeDiscount.discountedPricePerCase;
    }
    return s.pricePerCase;
  }

  /** ACTION: creates a purchase order against a supplier. Mutates the in-memory dataset. */
  createPurchaseOrder(supplierId: string, cases: number, createdBy: string): PurchaseOrder {
    const supplier = this.getSupplier(supplierId);
    const unitPrice = this.effectivePrice(supplierId, cases);
    const po: PurchaseOrder = {
      poId: `PO-${2300 + this.poCounter++}`,
      sku: (this.db.product as any).sku,
      supplierId,
      cases,
      unitPrice,
      totalCostUsd: Number((unitPrice * cases).toFixed(2)),
      status: "created",
      createdAt: new Date().toISOString(),
      createdBy,
    };
    this.db.existingPurchaseOrders.push(po);
    this.db.budget.spentSoFarUsd = Number(
      (this.db.budget.spentSoFarUsd + po.totalCostUsd).toFixed(2)
    );
    return po;
  }

  /** VALIDATION: checks a (hypothetical or created) order against hard operational constraints. */
  validateOrder(supplierId: string, cases: number) {
    const supplier = this.getSupplier(supplierId);
    const warehouse = this.getWarehouseCapacity();
    const budget = this.getBudgetStatus();
    const unitPrice = this.effectivePrice(supplierId, cases);
    const totalCostUsd = Number((unitPrice * cases).toFixed(2));
    const inventory = this.getInventoryStatus();

    const meetsMoq = cases >= supplier.moqCases;
    const fitsStorage = cases <= warehouse.freeCapacityCases;
    const withinBudget = totalCostUsd <= budget.remainingUsd;
    const arrivesBeforeStockout = supplier.leadTimeDays <= inventory.daysOfStockLeft;
    const projectedStockoutGapDays = arrivesBeforeStockout
      ? 0
      : Number((supplier.leadTimeDays - inventory.daysOfStockLeft).toFixed(1));

    return {
      supplierId,
      cases,
      unitPrice,
      totalCostUsd,
      checks: {
        meetsMoq,
        fitsStorage,
        withinBudget,
        arrivesBeforeStockout,
      },
      freeCapacityCases: warehouse.freeCapacityCases,
      remainingBudgetUsd: budget.remainingUsd,
      moqCases: supplier.moqCases,
      leadTimeDays: supplier.leadTimeDays,
      daysOfStockLeft: inventory.daysOfStockLeft,
      projectedStockoutGapDays,
      passes: meetsMoq && fitsStorage && withinBudget,
    };
  }
}
