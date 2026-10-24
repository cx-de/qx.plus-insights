# Privacy

QX+ Insights keeps your portfolio data in your browser's extension storage. It has no analytics and no tracking. This page lists every place data goes when it leaves your device.

## Data stored on your device

- Positions, cash balances and account labels that the extension reads from the broker pages you open (flatex, Smartbroker+, Consorsbank, wikifolio, justTRADE).
- Your settings, alerts, groups, notes, targets, forecast scenarios and daily portfolio totals.
- Your QX+ API key and, if you set them up, your Telegram bot token and channel id.

Backups you export contain your portfolio data and settings. They never contain your API key, Telegram credentials or broker session data.

## Data sent to QX+ (api.qx.plus)

| Purpose | What is sent | When |
|---|---|---|
| Prices and product data | WKN/ISIN/currency codes of your holdings, your API key | On page open and on the refresh interval you set |
| Usage and key check | Your API key | When you open the dashboard or save the key |
| Update check | The extension version and browser type | Periodically, without your API key |
| Support form | Your message, the dashboard page, extension version and language; your name and email if you have no API key (otherwise your API key); a screenshot of the dashboard if you tick the option, which can show your positions and values | Only when you submit the form |

Apart from a support screenshot you choose to attach, no position sizes, balances or account numbers are sent to QX+.

## Data sent to Telegram (api.telegram.org)

Only if you enable Telegram alerts: the alert text (product name, alert name, condition and value) goes to the bot and channel you configured, using your bot token. The browser asks for permission to contact Telegram when you turn this on.

## Broker websites

The extension reads the broker pages you already have open. On flatex and wikifolio it also loads pages from the same broker site, using your existing login, to fill in purchase dates and WKNs. Nothing from these pages is sent anywhere except as listed above.

## Contact

Use the support form in the extension, or see [SECURITY.md](SECURITY.md) for reporting security issues.
