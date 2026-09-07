export type DataMode = "mcp";

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  valueUsd: number;
}

export interface MarketTicker {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
}

export interface DashboardSnapshot {
  balances: Balance[];
  balanceSummary: {
    totalValueUsd: number;
    visibleCount: number;
    hiddenCount: number;
  };
  markets: MarketTicker[];
  source: DataMode;
  updatedAt: string;
}

export interface OrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  quantity: number;
  price?: number;
}

export interface OrderPreview extends OrderRequest {
  estimatedTotal: number;
  balanceAsset: string;
  availableBalance: number;
  expiresAt: string;
}

export interface TradeProposal {
  thesis: string;
  risk: string;
  order: OrderRequest;
}

export type HostMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "ask"; text: string }
  | { type: "confirmOrder" }
  | { type: "cancelOrder" };

export type WebviewMessage =
  | { type: "snapshot"; snapshot: DashboardSnapshot }
  | { type: "assistant"; text: string; source: DataMode }
  | { type: "orderPreview"; preview: OrderPreview }
  | { type: "tradeProposal"; proposal: TradeProposal; preview: OrderPreview }
  | { type: "orderResult"; text: string; success: boolean }
  | { type: "error"; message: string }
  | { type: "status"; connected: boolean; mode: DataMode };
