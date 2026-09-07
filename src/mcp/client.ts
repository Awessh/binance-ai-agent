import * as vscode from "vscode";
import { Balance, DashboardSnapshot, MarketTicker, OrderPreview, OrderRequest } from "../shared/types";

export interface BinanceDataClient {
  getSnapshot(): Promise<DashboardSnapshot>;
  prepareOrder(order: OrderRequest): Promise<OrderPreview>;
  executeOrder(order: OrderRequest): Promise<unknown>;
}

export class VscodeMcpBinanceClient implements BinanceDataClient {
  async getSnapshot(): Promise<DashboardSnapshot> {
    const accountBalances = await this.getBalances();
    const markets = await this.getMarkets();
    const allBalances = accountBalances.map((balance) => ({
      ...balance,
      valueUsd: balance.valueUsd || estimateValueUsd(balance, markets)
    }));
    const balances = compactBalances(allBalances);
    return {
      source: "mcp",
      updatedAt: new Date().toISOString(),
      balances,
      balanceSummary: {
        totalValueUsd: allBalances.reduce((total, balance) => total + balance.valueUsd, 0),
        visibleCount: balances.length,
        hiddenCount: Math.max(0, allBalances.length - balances.length)
      },
      markets
    };
  }

  async prepareOrder(order: OrderRequest): Promise<OrderPreview> {
    const normalized = validateOrderInput(order);
    const snapshot = await this.getSnapshot();
    const market = snapshot.markets.find((entry) => entry.symbol === normalized.symbol);
    if (!market) {
      throw new Error(`Market ${normalized.symbol} is unavailable or has not been verified.`);
    }
    const estimatedTotal = (normalized.price ?? market.price) * normalized.quantity;
    if (!Number.isFinite(estimatedTotal) || estimatedTotal <= 0 || estimatedTotal > 10000) {
      throw new Error("The estimated amount must be greater than 0 and no more than 10,000 USD.");
    }
    const balanceAsset = normalized.side === "SELL" ? baseAsset(normalized.symbol) : quoteAsset(normalized.symbol);
    const allBalances = await this.getBalances();
    const balance = allBalances.find((entry) => entry.asset === balanceAsset);
    const availableBalance = balance?.free ?? 0;
    const requiredBalance = normalized.side === "SELL" ? normalized.quantity : estimatedTotal;
    if (availableBalance < requiredBalance) {
      throw new Error(`Insufficient balance: ${balanceAsset} available ${availableBalance}, required ${requiredBalance}.`);
    }
    return {
      ...normalized,
      estimatedTotal,
      balanceAsset,
      availableBalance,
      expiresAt: new Date(Date.now() + 120000).toISOString()
    };
  }

  async executeOrder(order: OrderRequest): Promise<unknown> {
    const preview = await this.prepareOrder(order);
    const tool = findTool(["spot_newOrder"]);
    return invoke(tool.name, {
      symbol: preview.symbol,
      side: preview.side,
      type: preview.type,
      quantity: String(preview.quantity),
      ...(preview.type === "LIMIT" ? { price: String(preview.price), timeInForce: "GTC" } : {})
    });
  }

  private async getBalances(): Promise<Balance[]> {
    const tool = findTool(["spot_getAccount"]);
    const result = await invoke(tool.name, {});
    const rows = asArray(result).map((row) => {
      const record = asRecord(row);
      return {
        asset: String(record.asset ?? record.coin ?? "UNKNOWN"),
        free: toNumber(record.free ?? record.available ?? record.availableBalance),
        locked: toNumber(record.locked ?? record.freeze ?? record.lockedBalance),
        valueUsd: toNumber(record.valueUsd ?? record.usdValue ?? 0)
      };
    });
    return rows.filter((row) => row.asset !== "UNKNOWN");
  }

  private async getMarkets(): Promise<MarketTicker[]> {
    const tool = findTool(["spot_ticker24hr", "spot_tickerPrice"]);
    const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
    const results = await Promise.all(symbols.map(async (symbol) => {
      const result = await invoke(tool.name, { symbol });
      const record = marketRecord(result);
      return {
        symbol: String(record.symbol ?? symbol),
        price: toNumber(record.price ?? record.lastPrice ?? record.last),
        changePercent: toNumber(record.priceChangePercent ?? record.changePercent ?? record.priceChangePercent24h ?? 0),
        volume: toNumber(record.volume ?? record.volume24h ?? 0)
      };
    }));
    return results;
  }
}

function findTool(candidates: string[]): vscode.LanguageModelToolInformation {
  const tool = candidates
    .map((suffix) => vscode.lm.tools.find((entry) => entry.name === suffix || entry.name.endsWith(`_${suffix}`)))
    .find(Boolean);
  if (!tool) {
    const available = vscode.lm.tools.filter((entry) => /binance|spot/i.test(`${entry.name} ${entry.description}`)).map((entry) => entry.name);
    throw new Error(`Binance tool not found. Detected tools: ${available.join(", ") || "none"}`);
  }
  return tool;
}

async function invoke(name: string, input: Record<string, unknown>): Promise<unknown> {
  const result = await vscode.lm.invokeTool(name, { input, toolInvocationToken: undefined });
  const text = result.content
    .filter((part): part is vscode.LanguageModelTextPart => part instanceof vscode.LanguageModelTextPart)
    .map((part) => part.value)
    .join("\n")
    .trim();
  if (!text) {
    throw new Error(`Tool ${name} returned no usable data.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response received from tool ${name}.`);
  }
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.data)) return value.data;
  if (isRecord(value) && Array.isArray(value.balances)) return value.balances;
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function marketRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  if (isRecord(value) && Array.isArray(value.data)) return asRecord(value.data[0]);
  if (isRecord(value) && isRecord(value.data)) return value.data;
  return asRecord(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function compactBalances(balances: Balance[]): Balance[] {
  return balances
    .filter((balance) => balance.free > 0 || balance.locked > 0)
    .sort((left, right) => {
      if (right.valueUsd !== left.valueUsd) return right.valueUsd - left.valueUsd;
      return (right.free + right.locked) - (left.free + left.locked);
    })
    .slice(0, 8);
}

function estimateValueUsd(balance: Balance, markets: MarketTicker[]): number {
  const amount = balance.free + balance.locked;
  if (amount <= 0) return 0;
  if (["USDT", "USDC", "BUSD"].includes(balance.asset)) return amount;
  const market = markets.find((entry) => entry.symbol === `${balance.asset}USDT`);
  return market ? amount * market.price : 0;
}

function validateOrderInput(order: OrderRequest): OrderRequest {
  const symbol = order.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(symbol)) {
    throw new Error("Invalid symbol. Use a symbol such as BTCUSDT.");
  }
  if (order.side !== "BUY" && order.side !== "SELL") {
    throw new Error("Invalid order side.");
  }
  if (order.type !== "LIMIT" && order.type !== "MARKET") {
    throw new Error("Invalid order type.");
  }
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
    throw new Error("Quantity must be a number greater than 0.");
  }
  if (order.type === "LIMIT" && (!Number.isFinite(order.price) || (order.price ?? 0) <= 0)) {
    throw new Error("A LIMIT order must have a price greater than 0.");
  }
  return { ...order, symbol, quantity: order.quantity, price: order.price };
}

function quoteAsset(symbol: string): string {
  return ["USDT", "USDC", "BUSD", "BTC", "ETH"].find((asset) => symbol.endsWith(asset)) ?? "USDT";
}

function baseAsset(symbol: string): string {
  const quote = quoteAsset(symbol);
  return symbol.slice(0, -quote.length);
}
