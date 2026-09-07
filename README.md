# Binance MCP Dashboard

A local VS Code extension to display Binance data via the MCP server connected to VS Code and interact with an LLM provider.

## Current State

The dashboard calls Binance tools registered by VS Code via `vscode.lm.invokeTool`. It does not contain any mocked data and does not require copying the OAuth authentication from the MCP server.

The chat uses the Copilot model available via `vscode.lm.selectChatModels`. It transforms requests into responses or controlled JSON intents. An order intent can only become a Binance call after validation of the symbol, type, quantity, price, current market, and available balance, followed by explicit confirmation in the dashboard.

## What the Agent Actually Does

The agent is a VS Code extension that acts as a controlled intermediary between GitHub Copilot, the Binance MCP server, and an integrated dashboard. It does not connect directly with a Binance key in the browser: it uses MCP tools authenticated and registered by VS Code.

### Data Retrieved

After the `Refresh` action, the agent retrieves the actual data via MCP:

- the Spot account and available balances;

- the 24-hour prices and statistics of `BTCUSDT`, `ETHUSDT`, and `BNBUSDT`;

- the price change and volume when provided by Binance.

The dashboard retains the last snapshot in memory. It does not automatically query Binance with every price change. A new MCP read is initiated only after `Refresh`, or when a trade needs to be rechecked.

### Market Analysis

You can write a request in English, for example:

```text
Analyze BTCUSDT and propose a conservative position.

``

The agent sends the real data it has already retrieved to the Copilot model. The model returns a structured analysis in English that may include:

- a market summary;

- a trading thesis;

- identified risks;

- a `BUY` or `SELL` recommendation;

- a symbol, an order type, a quantity, and optionally a price.

The model's recommendation is a suggestion, not an automatic execution. The agent revalidates it with Binance data before displaying it.

### Placing an Order

For a valid recommendation, the dashboard displays a confirmation card containing the symbol, direction, quantity, type, price, estimated amount, and verified balance.

The `spot_newOrder` call is only executed if you click `Confirm order`. Before sending, the agent rechecks:

- the symbol format;

- the side and type of the order;
- Quantity and price;

- Market availability;

- Available balance;

- An estimated amount greater than zero and less than or equal to USD 10,000.

`Reject proposal` cancels the proposal and does not send any orders to Binance.

### What the agent does not yet do

- It does not perform autonomous trading.

- It does not place orders without explicit confirmation.

- It does not yet handle transfers between wallets.

- It does not yet handle order cancellations.

- It does not provide guaranteed financial advice and does not promise any results.

- It does not automatically monitor the market in the background.

## Launch

```powershell
npm install
```npm run compile
```

In VS Code:

1. Open this folder.

2. Press `F5` to launch the Extension Development Host.

3. Run `Binance MCP: Open Dashboard` from the command palette.

In the dashboard, click `Refresh` to load live data. MCP confirmations are controlled by VS Code and may appear on the first authorized read.

The `binanceMcpDashboard.dataMode` setting is set to `mcp`. LIMIT and MARKET orders are placed via `spot_newOrder`, with a limit of $10,000 per order and a re-validation upon confirmation. Transfers and cancellations are not yet implemented.

To use the chat, GitHub Copilot must be logged into VS Code, and a template must be available for the `vscode.lm` API.

## Security

LLM and Binance keys should never be stored in the Webview, repository, or logs. Binance authentication remains handled by VS Code and actual operations are protected by extension-side validation and explicit confirmation in the dashboard.
