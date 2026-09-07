"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VscodeLlmProvider = void 0;
const vscode = __importStar(require("vscode"));
class VscodeLlmProvider {
    async interpret(question, snapshot) {
        const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
        const model = models[0];
        if (!model) {
            throw new Error("No VS Code LLM is available. Sign in to GitHub Copilot or configure a compatible provider.");
        }
        const system = [
            "You are a strictly controlled trading assistant.",
            "Always answer in English and return only one valid JSON object, with no markdown.",
            'For a market analysis: {"kind":"analysis","answer":"...","proposal":null} or include "proposal":{"thesis":"...","risk":"...","order":{"symbol":"BTCUSDT","side":"BUY|SELL","type":"LIMIT|MARKET","quantity":number,"price":number|null}}.',
            'For a direct order request, use kind "analysis" and include the same proposal object.',
            "Never invent missing values. If information is missing, return kind answer and ask for it.",
            "Do not give investment recommendations or promise results.",
            `Current real data: ${JSON.stringify(snapshot)}`
        ].join("\n");
        const response = await model.sendRequest([
            vscode.LanguageModelChatMessage.User(system),
            vscode.LanguageModelChatMessage.User(question)
        ], { justification: "Analyze a Binance request and produce a controlled intent" });
        const text = await collectText(response.text);
        return parseIntent(text);
    }
}
exports.VscodeLlmProvider = VscodeLlmProvider;
async function collectText(parts) {
    let text = "";
    for await (const part of parts) {
        text += part;
    }
    return text.trim();
}
function parseIntent(text) {
    const parsed = parseJsonObject(text);
    if (parsed === undefined) {
        return { kind: "answer", answer: text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim() };
    }
    if (!isRecord(parsed) || parsed.kind === "answer") {
        const answer = isRecord(parsed) && typeof parsed.answer === "string" ? parsed.answer : "The LLM returned an invalid response.";
        return { kind: "analysis", answer };
    }
    if (parsed.kind !== "analysis" || typeof parsed.answer !== "string") {
        throw new Error("The LLM intent is not recognized.");
    }
    if (!isRecord(parsed.proposal) || !isRecord(parsed.proposal.order)) {
        return { kind: "analysis", answer: parsed.answer };
    }
    const proposal = parsed.proposal;
    const order = proposal.order;
    return {
        kind: "analysis",
        answer: parsed.answer,
        proposal: {
            thesis: String(proposal.thesis ?? "No thesis provided."),
            risk: String(proposal.risk ?? "Risk was not provided."),
            order: {
                symbol: String(order.symbol ?? ""),
                side: order.side === "SELL" ? "SELL" : "BUY",
                type: order.type === "MARKET" ? "MARKET" : "LIMIT",
                quantity: toNumber(order.quantity),
                price: order.price === null || order.price === undefined ? undefined : toNumber(order.price)
            }
        }
    };
}
function parseJsonObject(text) {
    const normalized = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
        return JSON.parse(normalized);
    }
    catch {
        const start = normalized.indexOf("{");
        if (start < 0)
            return undefined;
        for (let end = normalized.length; end > start; end -= 1) {
            try {
                return JSON.parse(normalized.slice(start, end));
            }
            catch {
                continue;
            }
        }
        return undefined;
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function toNumber(value) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : 0;
}
//# sourceMappingURL=provider.js.map