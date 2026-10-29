# QX+ Insights

QX+ Insights provides real-time market data and in-depth financial analysis with a privacy-first approach, offering intelligent forecasts and the aggregation of data across multiple online broker accounts - all accessible as a Chrome Extension or Firefox Add-on.

## Key Features

🏦 Enhanced Details – View extra insights that are not available by default on Flatex, Smartbroker+, Consorsbank, justTRADE, Scalable Capital and wikifolio (more brokers will follow)

🔎 Seamless Integration – QX+ Insights works directly within the broker pages of these platforms without any extra setup

⚡ Updates – Automatically refreshes and displays the latest stock/ETFs/structured products data without interrupting your workflow

🔧 User-Friendly – A lightweight extension/add-on that operates smoothly in the background, improving your trading experience effortlessly

## Building from source

```bash
npm ci
npm run build          # Chrome; use build:firefox for Firefox
npm test
```

The build output lands in `.output/`. The API and portal URLs are constants in `utils/constants.ts`.

`examples/sample_backup.json` is a backup with made-up demo data. Import it under Settings → Backup to try the dashboard without a broker account.

## Third-party data and libraries

- `assets/countries.json` is derived from [world-atlas](https://github.com/topojson/world-atlas) (ISC license).
- Spreadsheet export uses [SheetJS](https://sheetjs.com) (Apache-2.0), installed from the SheetJS CDN rather than npm. Dependabot cannot track that tarball, so check SheetJS releases by hand.

## Privacy

See [PRIVACY.md](PRIVACY.md) for what is stored on your device and every place data is sent.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.
