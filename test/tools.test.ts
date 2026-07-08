import { describe, expect, it, vi } from "vitest";
import { HeadlessRecordsApiError } from "../src/errors.js";
import { createToolHandler, toolDefinitions } from "../src/tools.js";

describe("MCP tools", () => {
  it("keeps assessment period inputs aligned with the API contract", () => {
    const assessment = toolDefinitions.find(
      (tool) => tool.name === "assess_insider_activity"
    );

    expect(assessment?.inputSchema.properties.period.enum).toEqual([
      "30d",
      "90d",
      "180d"
    ]);
  });

  it("formats successful tool output as JSON text", async () => {
    const payload = {
      request_id: "req_tool",
      caveats: [{ code: "non_advisory", message: "Not financial advice." }],
      sources: [{ accession_number: "0000001001-26-000123" }]
    };
    const handler = createToolHandler({
      getFreshness: vi.fn(async () => payload),
      assessInsiderActivity: vi.fn(),
      getFilingProvenance: vi.fn()
    });

    const result = await handler("get_freshness", {});

    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
    });
  });

  it("passes freshness default input to the client", async () => {
    const getFreshness = vi.fn(async () => ({ request_id: "req_fresh" }));
    const handler = createToolHandler({
      getFreshness,
      assessInsiderActivity: vi.fn(),
      getFilingProvenance: vi.fn()
    });

    await handler("get_freshness", {});

    expect(getFreshness).toHaveBeenCalledWith({ freshness_window_hours: 24 });
  });

  it("uppercases ticker and applies assessment defaults", async () => {
    const assessInsiderActivity = vi.fn(async () => ({ request_id: "req_assess" }));
    const handler = createToolHandler({
      getFreshness: vi.fn(),
      assessInsiderActivity,
      getFilingProvenance: vi.fn()
    });

    await handler("assess_insider_activity", { ticker: "tsla" });

    expect(assessInsiderActivity).toHaveBeenCalledWith({
      ticker: "TSLA",
      period: "90d",
      freshness_window_hours: 24
    });
  });

  it("passes filing provenance input to the client", async () => {
    const getFilingProvenance = vi.fn(async () => ({ request_id: "req_prov" }));
    const handler = createToolHandler({
      getFreshness: vi.fn(),
      assessInsiderActivity: vi.fn(),
      getFilingProvenance
    });

    await handler("get_filing_provenance", {
      accession_number: "0000001001-26-000123"
    });

    expect(getFilingProvenance).toHaveBeenCalledWith({
      accession_number: "0000001001-26-000123"
    });
  });

  it("formats API errors without exposing raw API keys", async () => {
    const rawKey = "hr_live_test_secret_value";
    const handler = createToolHandler({
      getFreshness: vi.fn(async () => {
        throw new HeadlessRecordsApiError({
          code: "server_error",
          message: `Headless Records API returned a server error. ${rawKey}`,
          status: 500,
          requestId: "req_500"
        });
      }),
      assessInsiderActivity: vi.fn(),
      getFilingProvenance: vi.fn()
    });

    const result = await handler("get_freshness", {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("req_500");
    expect(result.content[0]?.text).not.toContain(rawKey);
  });
});
