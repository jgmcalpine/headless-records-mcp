# Headless Records MCP Server

A local [Model Context Protocol](https://modelcontextprotocol.io) (MCP) stdio server that gives agents structured, non-advisory access to public SEC Form 4 insider filing data via the hosted Headless Records API.

The server is a thin wrapper: it validates tool input, calls `https://api.headlessrecords.dev`, and returns the API's JSON responses as formatted text. It does not call SEC directly, does not connect to a database, and does not run ingestion jobs.

## Safety and Scope

- Responses summarize **public SEC Form 4 filing data** from a bounded, watched-ticker universe. They do not imply full-market coverage.
- Output is **not financial advice**. The server provides no buy, sell, hold, bullish, bearish, price prediction, alpha, trading signal, or investment recommendation guidance.
- API caveats, methodology notes, request IDs, timestamps, and source provenance are preserved in tool output so agents can show context rather than over-compress results.

## Requirements

- Node.js 20 or later (uses the built-in `fetch`)
- A Headless Records API key (`hr_live_` prefix)

## Install and Build

```bash
npm install
npm run build
```

The compiled server is written to `dist/index.js`.

## Configuration

The server is configured entirely through environment variables read from the process. Export them in your shell or set them in your MCP client config. (`.env.example` is a reference file only; the server does not auto-load `.env`.)

Required:

- `HEADLESS_RECORDS_API_KEY` — your API key, sent as the `X-API-Key` header.

Optional:

- `HEADLESS_RECORDS_API_BASE_URL` — defaults to `https://api.headlessrecords.dev`.
- `HEADLESS_RECORDS_TIMEOUT_MS` — per-request timeout, defaults to `10000`.

Do not commit real API keys.

## Running

Run from source:

```bash
HEADLESS_RECORDS_API_KEY=hr_live_REPLACE_ME npm start
```

Run the built stdio server:

```bash
HEADLESS_RECORDS_API_KEY=hr_live_REPLACE_ME node /absolute/path/to/dist/index.js
```

## MCP Client Configuration

Example configuration for Cursor, Claude Desktop, or any MCP client, after `npm run build`:

```json
{
  "mcpServers": {
    "headless-records": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "HEADLESS_RECORDS_API_KEY": "hr_live_REPLACE_ME"
      }
    }
  }
}
```

## Tools

### `get_freshness`

Returns freshness status for the configured watched-ticker universe.

```json
{
  "freshness_window_hours": 24
}
```

- `freshness_window_hours` (optional integer, 1–168, default `24`)

Calls `GET /v1/freshness`.

### `assess_insider_activity`

Returns a deterministic, non-advisory summary of reported SEC Form 4 insider activity for a ticker. Tickers are normalized to uppercase before the API call.

```json
{
  "ticker": "TSLA",
  "period": "90d",
  "freshness_window_hours": 24
}
```

- `ticker` (required string)
- `period` (optional, one of `30d`, `90d`, `180d`, default `90d`)
- `freshness_window_hours` (optional integer, 1–168, default `24`)

Calls `GET /v1/insider-activity/{ticker}/assessment`.

### `get_filing_provenance`

Returns source provenance for an imported SEC Form 4 filing, including the source document URL, retrieval timestamp, and SHA-256 hash when available.

```json
{
  "accession_number": "0000001001-26-000123"
}
```

- `accession_number` (required string)

Calls `GET /v1/provenance/filing/{accession_number}`.

## Error Behavior

Tool errors are returned as structured JSON with a stable `code` field:

- Missing, invalid, or revoked API keys surface as `unauthorized` (HTTP 401).
- Rate limits surface as `rate_limited` (HTTP 429), including `retry_after` when the API provides it.
- Timeouts, network failures, and invalid responses surface as `timeout`, `network_error`, and `invalid_json`.
- API request IDs are preserved in error output when available.
- Raw `hr_live_...` API keys are redacted from all error text.

## Development

```bash
npm test
```

Tests run with Vitest and use mocked HTTP; they never call the live API.

## Known Limitations

- Local stdio server only; this is not a hosted remote MCP server.
- Requires a valid `HEADLESS_RECORDS_API_KEY` and inherits the API's per-key rate limits.
- Coverage is bounded to the watched-ticker universe and imported filings; it does not fetch SEC data live.
- Does not manage watched tickers, billing, or authentication flows.
- Returns formatted JSON text; it does not transform API output into advice.
