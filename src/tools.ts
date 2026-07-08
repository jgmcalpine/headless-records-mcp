import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  type AssessmentInput,
  type FilingProvenanceInput,
  type FreshnessInput,
  type HeadlessRecordsApi
} from "./headless-records-client.js";
import { HeadlessRecordsApiError, errorToJson } from "./errors.js";

export type McpToolResult = CallToolResult;

const freshnessSchema = z.object({
  freshness_window_hours: z.number().int().min(1).max(168).default(24)
});

const assessmentPeriods = ["30d", "90d", "180d"] as const;

const assessmentSchema = z.object({
  ticker: z.string().trim().min(1).transform((ticker) => ticker.toUpperCase()),
  period: z.enum(assessmentPeriods).default("90d"),
  freshness_window_hours: z.number().int().min(1).max(168).default(24)
});

const filingProvenanceSchema = z.object({
  accession_number: z.string().trim().min(1)
});

export const toolDefinitions = [
  {
    name: "get_freshness",
    description:
      "Return freshness status for the configured Headless Records watched ticker universe. This summarizes public SEC filing data coverage status, does not imply full-market coverage, and the watched ticker coverage is bounded.",
    inputSchema: {
      type: "object",
      properties: {
        freshness_window_hours: {
          type: "integer",
          minimum: 1,
          maximum: 168,
          default: 24
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "assess_insider_activity",
    description:
      "Return a deterministic, non-advisory summary of reported public SEC Form 4 insider activity for a ticker. This uses bounded watched-ticker and imported-filing coverage and does not provide buy, sell, hold, bullish, bearish, price prediction, alpha, trading signal, or investment recommendation guidance.",
    inputSchema: {
      type: "object",
      required: ["ticker"],
      properties: {
        ticker: { type: "string", minLength: 1 },
        period: {
          type: "string",
          enum: assessmentPeriods,
          default: "90d"
        },
        freshness_window_hours: {
          type: "integer",
          minimum: 1,
          maximum: 168,
          default: 24
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_filing_provenance",
    description:
      "Return source provenance for an imported SEC Form 4 filing, including source document URL, retrieval timestamp, and SHA-256 hash when available. This summarizes public SEC filing data provenance and does not provide buy, sell, hold, price prediction, or investment recommendation guidance.",
    inputSchema: {
      type: "object",
      required: ["accession_number"],
      properties: {
        accession_number: { type: "string", minLength: 1 }
      },
      additionalProperties: false
    }
  }
] as const;

export function createToolHandler(client: HeadlessRecordsApi) {
  return async function handleTool(
    name: string,
    rawInput: unknown
  ): Promise<McpToolResult> {
    try {
      if (name === "get_freshness") {
        const input: FreshnessInput = freshnessSchema.parse(rawInput ?? {});
        return jsonText(await client.getFreshness(input));
      }

      if (name === "assess_insider_activity") {
        const input: AssessmentInput = assessmentSchema.parse(rawInput ?? {});
        return jsonText(await client.assessInsiderActivity(input));
      }

      if (name === "get_filing_provenance") {
        const input: FilingProvenanceInput = filingProvenanceSchema.parse(rawInput ?? {});
        return jsonText(await client.getFilingProvenance(input));
      }

      throw new HeadlessRecordsApiError({
        code: "invalid_input",
        message: `Unknown Headless Records MCP tool: ${name}.`
      });
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(errorToJson(error), null, 2) }]
      };
    }
  };
}

function jsonText(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}
