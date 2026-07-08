import { describe, expect, it, vi } from "vitest";
import {
  HeadlessRecordsApiError,
  createClientFromEnv
} from "../src/headless-records-client.js";

const API_KEY = "hr_live_test_secret_value";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

describe("HeadlessRecordsClient", () => {
  it("fails clearly when HEADLESS_RECORDS_API_KEY is missing", () => {
    expect(() =>
      createClientFromEnv({
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test"
      })
    ).toThrow(/HEADLESS_RECORDS_API_KEY is required/);
  });

  it("get_freshness calls the expected endpoint with X-API-Key", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ request_id: "req_1", caveats: [], sources: [] })
    );
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test/",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    await client.getFreshness({ freshness_window_hours: 12 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.example.test/v1/freshness?freshness_window_hours=12"
    );
    expect(new Headers(init?.headers).get("X-API-Key")).toBe(API_KEY);
  });

  it("assess_insider_activity uppercases ticker and applies defaults", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ request_id: "req_2" }));
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    await client.assessInsiderActivity({ ticker: "tsla" });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.example.test/v1/insider-activity/TSLA/assessment?period=90d&freshness_window_hours=24"
    );
  });

  it("get_filing_provenance calls the expected endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ request_id: "req_3" }));
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    await client.getFilingProvenance({
      accession_number: "0000001001-26-000123"
    });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.example.test/v1/provenance/filing/0000001001-26-000123"
    );
  });

  it("handles 401 clearly", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error: { code: "unauthorized", message: "A valid API key is required." },
          request_id: "req_401"
        },
        { status: 401 }
      )
    );
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    await expect(client.getFreshness({})).rejects.toMatchObject({
      status: 401,
      requestId: "req_401",
      message: expect.stringContaining("missing or invalid")
    });
  });

  it("handles 429 with Retry-After guidance", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error: { code: "rate_limited", message: "Rate limit exceeded." },
          request_id: "req_429"
        },
        { status: 429, headers: { "Retry-After": "42" } }
      )
    );
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    await expect(client.getFreshness({})).rejects.toMatchObject({
      status: 429,
      requestId: "req_429",
      retryAfter: "42",
      message: expect.stringContaining("Retry-After: 42")
    });
  });

  it("handles 500 with API request_id", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: "internal_error" }, request_id: "req_500" }, { status: 500 })
    );
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    await expect(client.getFreshness({})).rejects.toMatchObject({
      status: 500,
      requestId: "req_500",
      message: expect.stringContaining("server error")
    });
  });

  it("does not include the raw API key in thrown errors", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: "internal_error" }, request_id: "req_500" }, { status: 500 })
    );
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    try {
      await client.getFreshness({});
      throw new Error("expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(HeadlessRecordsApiError);
      expect(String(error)).not.toContain(API_KEY);
    }
  });

  it("reports invalid JSON from the API", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("not json", { status: 200, headers: { "content-type": "application/json" } })
    );
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    await expect(client.getFreshness({})).rejects.toMatchObject({
      code: "invalid_json",
      message: expect.stringContaining("invalid JSON")
    });
  });

  it("reports network timeouts clearly", async () => {
    const timeoutError = new Error("The operation was aborted");
    timeoutError.name = "AbortError";
    const fetchMock = vi.fn(async () => {
      throw timeoutError;
    });
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY,
        HEADLESS_RECORDS_TIMEOUT_MS: "25"
      },
      fetchMock
    );

    await expect(client.getFreshness({})).rejects.toMatchObject({
      code: "timeout",
      message: expect.stringContaining("timed out")
    });
  });

  it("preserves caveats and sources from successful responses", async () => {
    const apiBody = {
      request_id: "req_ok",
      caveats: [{ code: "bounded_coverage", message: "Bounded watched ticker coverage." }],
      sources: [{ accession_number: "0000001001-26-000123", provenance_status: "available" }]
    };
    const fetchMock = vi.fn(async () => jsonResponse(apiBody));
    const client = createClientFromEnv(
      {
        HEADLESS_RECORDS_API_BASE_URL: "https://api.example.test",
        HEADLESS_RECORDS_API_KEY: API_KEY
      },
      fetchMock
    );

    await expect(client.getFreshness({})).resolves.toEqual(apiBody);
  });
});
