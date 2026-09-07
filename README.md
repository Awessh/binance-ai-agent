# Binance MCP Dashboard

Extension VS Code locale pour afficher des données Binance via le serveur MCP connecté à VS Code et dialoguer avec un provider LLM.

## État actuel

Le dashboard appelle les outils Binance enregistrés par VS Code via `vscode.lm.invokeTool`. Il ne contient aucune donnée mockée et ne demande pas de recopier l'authentification OAuth du serveur MCP.

Le chat utilise le modèle Copilot disponible via `vscode.lm.selectChatModels`. Il transforme les demandes en réponses ou en intentions JSON contrôlées. Une intention d'ordre ne peut devenir un appel Binance qu'après validation du symbole, du type, de la quantité, du prix, du marché actuel et du solde disponible, puis confirmation explicite dans le dashboard.

## Ce que fait réellement l'agent

L'agent est une extension VS Code qui sert d'intermédiaire contrôlé entre GitHub Copilot, le serveur MCP Binance et un dashboard intégré. Il ne se connecte pas directement avec une clé Binance dans le navigateur : il utilise les outils MCP authentifiés et enregistrés par VS Code.

### Données récupérées

Après l'action `Refresh`, l'agent récupère les données réelles via MCP :

- le compte Spot et les soldes disponibles ;
- les prix et statistiques 24h de `BTCUSDT`, `ETHUSDT` et `BNBUSDT` ;
- la variation de prix et le volume lorsque Binance les fournit.

Le dashboard conserve le dernier snapshot en mémoire. Il n'interroge pas Binance automatiquement à chaque variation de prix. Une nouvelle lecture MCP est lancée uniquement après `Refresh`, ou lorsqu'une opération doit être revérifiée.

### Analyse de marché

Vous pouvez écrire une demande en anglais, par exemple :

```text
Analyze BTCUSDT and propose a conservative position.
```

L'agent transmet au modèle Copilot les données réelles déjà récupérées. Le modèle retourne une analyse structurée en anglais qui peut contenir :

- une synthèse du marché ;
- une thèse de trading ;
- les risques identifiés ;
- une proposition `BUY` ou `SELL` ;
- un symbole, un type d'ordre, une quantité et éventuellement un prix.

La proposition du modèle est une suggestion, pas une exécution automatique. L'agent la revalide avec les données Binance avant de l'afficher.

### Passage d'un ordre

Pour une proposition valide, le dashboard affiche une carte de confirmation contenant le symbole, le sens, la quantité, le type, le prix, le montant estimé et le solde vérifié.

L'appel `spot_newOrder` n'est effectué que si vous cliquez sur `Confirm order`. Avant l'envoi, l'agent vérifie à nouveau :

- le format du symbole ;
- le côté et le type de l'ordre ;
- la quantité et le prix ;
- l'existence du marché ;
- le solde disponible ;
- un montant estimé supérieur à zéro et inférieur ou égal à 10 000 USD.

`Reject proposal` annule la proposition et n'envoie aucun ordre à Binance.

### Ce que l'agent ne fait pas encore

- Il ne fait pas de trading autonome.
- Il ne lance pas d'ordre sans confirmation explicite.
- Il ne gère pas encore les transferts entre portefeuilles.
- Il ne gère pas encore l'annulation d'ordres.
- Il ne fournit pas de conseil financier garanti et ne promet aucun résultat.
- Il ne surveille pas automatiquement le marché en arrière-plan.

## Lancer

```powershell
npm install
npm run compile
```

Dans VS Code :

1. Ouvrir ce dossier.
2. Appuyer sur `F5` pour lancer l'Extension Development Host.
3. Exécuter `Binance MCP: Open Dashboard` dans la palette de commandes.

Dans le dashboard, cliquez sur `Refresh` pour charger les données réelles. Les confirmations MCP sont contrôlées par VS Code et peuvent apparaître lors de la première lecture autorisée.

Le réglage `binanceMcpDashboard.dataMode` est fixé à `mcp`. Les ordres LIMIT et MARKET passent par `spot_newOrder`, avec un plafond de 10 000 USD par ordre et une nouvelle validation au moment de la confirmation. Les transferts et annulations ne sont pas encore implémentés.

Pour utiliser le chat, GitHub Copilot doit être connecté dans VS Code et un modèle doit être disponible pour l'API `vscode.lm`.

## Sécurité

Les clés LLM et Binance ne doivent jamais être placées dans le Webview, le dépôt ou les logs. L'authentification Binance reste gérée par VS Code et les opérations réelles sont protégées par une validation côté extension et une confirmation explicite dans le dashboard.
