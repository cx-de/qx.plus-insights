# QX+ Insights

QX+ Insights provides real-time market data and in-depth financial analysis with a privacy-first approach, offering intelligent forecasts and the aggregation of data across multiple online broker accounts - all accessible as a Chrome Extension or Firefox Add-on.

## Key Features

🏦 Enhanced Details – View extra insights that are not available by default on Flatex and Smartbroker+ (more brokers will follow)

🔎 Seamless Integration – QX+ Insights works directly within the broker pages of these platforms without any extra setup

⚡ Real-Time Updates – Automatically refreshes and displays the latest stock/ETFs/structuted prodducts data without interrupting your workflow

🔧 User-Friendly – A lightweight extension/add-on that operates smoothly in the background, improving your trading experience effortlessly

## Building from source

```bash
cp .env.example .env   # fill in the public API and portal URLs
npm ci
npm run build          # Chrome; use build:firefox for Firefox
npm test
```

The build output lands in `.output/`. Values in `.env` are baked into the bundle at build time, so only public URLs belong there.

## Third-party data and libraries

- `assets/countries.json` is derived from [world-atlas](https://github.com/topojson/world-atlas) (ISC license).
- Spreadsheet export uses [SheetJS](https://sheetjs.com) (Apache-2.0), installed from the SheetJS CDN rather than npm.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.
