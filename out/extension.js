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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const client_1 = require("./mcp/client");
const provider_1 = require("./llm/provider");
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("binanceMcpDashboard.open", () => {
        BinanceDashboardPanel.createOrShow(context);
    }));
}
class BinanceDashboardPanel {
    context;
    static currentPanel;
    panel;
    client = new client_1.VscodeMcpBinanceClient();
    llm = new provider_1.VscodeLlmProvider();
    disposables = [];
    pendingOrder;
    latestSnapshot;
    refreshInProgress = false;
    constructor(context) {
        this.context = context;
        this.panel = vscode.window.createWebviewPanel("binanceMcpDashboard", "Binance Dashboard", vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")]
        });
        this.panel.webview.html = getWebviewHtml(this.panel.webview);
        this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message), undefined, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    }
    static createOrShow(context) {
        if (BinanceDashboardPanel.currentPanel) {
            BinanceDashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            return;
        }
        BinanceDashboardPanel.currentPanel = new BinanceDashboardPanel(context);
    }
    async handleMessage(message) {
        if (message.type === "ready") {
            this.post({ type: "status", connected: false, mode: "mcp" });
            return;
        }
        if (message.type === "refresh") {
            await this.refresh();
            return;
        }
        if (message.type === "ask") {
            const question = message.text.trim();
            if (!question) {
                return;
            }
            try {
                const snapshot = await this.getSnapshotForRequest();
                this.post({ type: "status", connected: true, mode: snapshot.source });
                this.post({ type: "snapshot", snapshot });
                const intent = await this.llm.interpret(question, snapshot);
                this.post({ type: "assistant", text: intent.answer, source: "mcp" });
                if (intent.kind === "analysis" && intent.proposal) {
                    const preview = await this.client.prepareOrder(intent.proposal.order);
                    this.pendingOrder = intent.proposal.order;
                    this.post({ type: "tradeProposal", proposal: intent.proposal, preview });
                }
            }
            catch (error) {
                const text = error instanceof Error ? error.message : "An error occurred while processing the request.";
                this.post({ type: "error", message: text });
            }
            return;
        }
        if (message.type === "confirmOrder") {
            if (!this.pendingOrder) {
                this.post({ type: "error", message: "There is no order waiting for confirmation." });
                return;
            }
            const order = this.pendingOrder;
            this.pendingOrder = undefined;
            try {
                await this.client.executeOrder(order);
                this.post({ type: "orderResult", text: "Order sent to Binance successfully.", success: true });
                await this.refresh();
            }
            catch (error) {
                const text = error instanceof Error ? error.message : "The order was not executed.";
                this.post({ type: "orderResult", text, success: false });
            }
            return;
        }
        if (message.type === "cancelOrder") {
            this.pendingOrder = undefined;
            this.post({ type: "assistant", text: "Order cancelled. No execution call was made.", source: "mcp" });
        }
    }
    async refresh() {
        if (this.refreshInProgress) {
            return;
        }
        this.refreshInProgress = true;
        try {
            const snapshot = await this.client.getSnapshot();
            this.latestSnapshot = snapshot;
            this.post({ type: "status", connected: true, mode: snapshot.source });
            this.post({ type: "snapshot", snapshot });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error.";
            this.post({ type: "error", message });
        }
        finally {
            this.refreshInProgress = false;
        }
    }
    async getSnapshotForRequest() {
        if (this.latestSnapshot) {
            return this.latestSnapshot;
        }
        await this.refresh();
        if (!this.latestSnapshot) {
            throw new Error("Live Binance data is not available. Use Refresh and approve the MCP request.");
        }
        return this.latestSnapshot;
    }
    post(message) {
        void this.panel.webview.postMessage(message);
    }
    dispose() {
        BinanceDashboardPanel.currentPanel = undefined;
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }
}
function getWebviewHtml(webview) {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Binance Command Center</title>
  <style>
    :root { color-scheme: dark; --ink: #e8f0e6; --muted: #91a39b; --line: #27352f; --panel: #14201b; --panel-2: #1a2a23; --accent: #c8f36a; --warm: #ffb86b; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; color: var(--ink); background: radial-gradient(circle at 90% 0%, #294532 0, #0c1210 42%, #090d0b 100%); font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
    .shell { max-width: 1180px; margin: auto; }
    header { display: flex; justify-content: space-between; gap: 20px; align-items: end; margin-bottom: 28px; }
    h1, h2, p { margin: 0; } h1 { font: 700 clamp(28px, 5vw, 52px)/.95 Georgia, serif; letter-spacing: 0; } h2 { font-size: 15px; letter-spacing: .04em; text-transform: uppercase; }
    .eyebrow { color: var(--accent); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; margin-bottom: 9px; }
    .status { color: var(--muted); display: flex; gap: 9px; align-items: center; white-space: nowrap; } .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--warm); } .dot.online { background: var(--accent); }
    .grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 16px; } .panel { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--line); padding: 20px; box-shadow: 0 18px 45px #0003; } .wide { grid-column: 1 / -1; }
    .panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; } .hint { color: var(--muted); font-size: 12px; } .balance-metrics { display: grid; grid-template-columns: 1.2fr .8fr; gap: 8px; margin: -4px 0 16px; } .metric { background: var(--panel-2); padding: 11px 13px; border: 1px solid var(--line); } .metric-label { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; } .metric-value { display: block; margin-top: 3px; font-size: 20px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; } th, td { padding: 10px 0; text-align: left; border-bottom: 1px solid var(--line); } th { color: var(--muted); font-size: 11px; font-weight: 500; text-transform: uppercase; } td:last-child, th:last-child { text-align: right; } .positive { color: var(--accent); } .negative { color: var(--warm); }
    .chat { min-height: 365px; display: flex; flex-direction: column; } .messages { flex: 1; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; } .message { background: var(--panel-2); padding: 11px 13px; border-left: 2px solid var(--accent); } .message.user { border-left-color: var(--warm); } .composer { display: flex; gap: 8px; } input { min-width: 0; flex: 1; background: #0b120e; color: var(--ink); border: 1px solid var(--line); padding: 11px 12px; outline: none; } input:focus { border-color: var(--accent); } button { border: 0; padding: 0 15px; background: var(--accent); color: #0b120e; font-weight: 700; cursor: pointer; } button:hover { filter: brightness(1.08); } .order-preview { display: none; background: #282116; border: 1px solid var(--warm); padding: 14px; margin-bottom: 14px; } .order-preview.visible { display: block; } .order-actions { display: flex; gap: 8px; margin-top: 12px; } .order-actions .cancel { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    .notice { color: var(--warm); font-size: 12px; margin-top: 16px; } @media (max-width: 760px) { body { padding: 16px; } header { align-items: start; flex-direction: column; } .grid { grid-template-columns: 1fr; } .wide { grid-column: auto; } }
  </style>
</head>
<body>
  <main class="shell">
    <header><div><div class="eyebrow">Binance / MCP workspace</div><h1>Command center</h1></div><div class="status"><span id="dot" class="dot"></span><span id="status">Connecting...</span></div></header>
    <section class="grid">
      <article class="panel"><div class="panel-head"><h2>Balances</h2><span id="updated" class="hint">Waiting</span></div><div class="balance-metrics"><div class="metric"><span class="metric-label">Tracked value</span><strong id="balance-total" class="metric-value">—</strong></div><div class="metric"><span class="metric-label">Visible assets</span><strong id="balance-count" class="metric-value">—</strong></div></div><table><thead><tr><th>Asset</th><th>Available</th><th>USD value</th></tr></thead><tbody id="balances"><tr><td colspan="3" class="hint">Loading...</td></tr></tbody></table><p id="balance-note" class="hint" style="margin-top:12px"></p></article>
      <article class="panel"><div class="panel-head"><h2>Market</h2><button id="refresh" title="Refresh market data">Refresh</button></div><table><thead><tr><th>Pair</th><th>Price</th><th>24h</th></tr></thead><tbody id="markets"><tr><td colspan="3" class="hint">Loading...</td></tr></tbody></table><p class="notice">Data provided by Binance MCP using VS Code authentication.</p></article>
      <article class="panel wide chat"><div class="panel-head"><h2>Market analyst</h2><span class="hint">Analysis + trade proposal</span></div><div id="messages" class="messages"><div class="message">Ask for a market analysis. The assistant may propose a position, but you always control execution.</div></div><div id="order-preview" class="order-preview"><strong>Trade proposal - confirmation required</strong><p id="proposal-copy"></p><p id="order-details"></p><div class="order-actions"><button id="confirm-order" type="button">Confirm order</button><button id="cancel-order" class="cancel" type="button">Reject proposal</button></div></div><form id="form" class="composer"><input id="question" autocomplete="off" placeholder="Analyze BTCUSDT and propose a position..."/><button type="submit">Analyze</button></form></article>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('messages');
    const formatUsd = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    const formatValue = value => value > 0 ? formatUsd(value) : 'Not valued';
    const addMessage = (text, kind = '') => { const item = document.createElement('div'); item.className = 'message ' + kind; item.textContent = text; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; };
    window.addEventListener('message', event => { const message = event.data;
      if (message.type === 'status') { document.getElementById('status').textContent = message.connected ? 'MCP connected' : 'Ready - refresh to load'; document.getElementById('dot').classList.toggle('online', message.connected); }
      if (message.type === 'error') { addMessage(message.message); }
      if (message.type === 'assistant') { addMessage(message.text); }
      if (message.type === 'tradeProposal') { const preview = message.preview; document.getElementById('proposal-copy').textContent = 'Thesis: ' + message.proposal.thesis + ' Risk: ' + message.proposal.risk; document.getElementById('order-details').textContent = preview.side + ' ' + preview.quantity + ' ' + preview.symbol + ' / ' + preview.type + (preview.price ? ' at ' + preview.price : '') + ' ; estimated amount ' + formatUsd(preview.estimatedTotal) + ' ; verified balance: ' + preview.availableBalance + ' ' + preview.balanceAsset; document.getElementById('order-preview').classList.add('visible'); }
      if (message.type === 'orderPreview') { const preview = message.preview; document.getElementById('proposal-copy').textContent = 'Direct order request'; document.getElementById('order-details').textContent = preview.side + ' ' + preview.quantity + ' ' + preview.symbol + ' / ' + preview.type + (preview.price ? ' at ' + preview.price : '') + ' ; estimated amount ' + formatUsd(preview.estimatedTotal) + ' ; verified balance: ' + preview.availableBalance + ' ' + preview.balanceAsset; document.getElementById('order-preview').classList.add('visible'); }
      if (message.type === 'orderResult') { document.getElementById('order-preview').classList.remove('visible'); addMessage(message.text); }
      if (message.type === 'snapshot') { const snapshot = message.snapshot; const summary = snapshot.balanceSummary; document.getElementById('updated').textContent = new Date(snapshot.updatedAt).toLocaleTimeString('en-US'); document.getElementById('balance-total').textContent = formatValue(summary.totalValueUsd); document.getElementById('balance-count').textContent = summary.visibleCount; document.getElementById('balance-note').textContent = summary.hiddenCount ? summary.hiddenCount + ' non-zero asset(s) hidden to keep this view compact.' : 'Only assets with a balance are shown.'; document.getElementById('balances').innerHTML = snapshot.balances.map(row => '<tr><td><strong>' + row.asset + '</strong></td><td>' + row.free + '</td><td>' + formatValue(row.valueUsd) + '</td></tr>').join(''); document.getElementById('markets').innerHTML = snapshot.markets.map(row => '<tr><td><strong>' + row.symbol + '</strong></td><td>' + formatUsd(row.price) + '</td><td class="' + (row.changePercent >= 0 ? 'positive' : 'negative') + '">' + (row.changePercent >= 0 ? '+' : '') + row.changePercent + '%</td></tr>').join(''); }
    });
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('confirm-order').addEventListener('click', () => vscode.postMessage({ type: 'confirmOrder' }));
    document.getElementById('cancel-order').addEventListener('click', () => { document.getElementById('order-preview').classList.remove('visible'); vscode.postMessage({ type: 'cancelOrder' }); });
    document.getElementById('form').addEventListener('submit', event => { event.preventDefault(); const input = document.getElementById('question'); const text = input.value.trim(); if (!text) return; addMessage(text, 'user'); vscode.postMessage({ type: 'ask', text }); input.value = ''; });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
function getNonce() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
function deactivate() { }
//# sourceMappingURL=extension.js.map