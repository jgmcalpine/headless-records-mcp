import { HeadlessRecordsApiError } from "./errors.js";

export type Period = "30d" | "90d" | "180d";

export interface FreshnessInput {
  freshness_window_hours?: number;
}

export interface AssessmentInput {
  ticker: string;
  period?: Period;
  freshness_window_hours?: number;
}

export interface FilingProvenanceInput {
  accession_number: string;
}

export interface HeadlessRecordsApi {
  getFreshness(input: FreshnessInput): Promise<unknown>;
  assessInsiderActivity(input: AssessmentInput): Promise<unknown>;
  getFilingProvenance(input: FilingProvenanceInput): Promise<unknown>;
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

interface ClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

const DEFAULT_API_BASE_URL = "https://api.headlessrecords.dev";
const DEFAULT_TIMEOUT_MS = 10_000;

export class HeadlessRecordsClient implements HeadlessRecordsApi {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: ClientConfig, fetchImpl: FetchLike = fetch) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async getFreshness(input: FreshnessInput): Promise<unknown> {
    return this.request("/v1/freshness", {
      freshness_window_hours: String(input.freshness_window_hours ?? 24)
    });
  }

  async assessInsiderActivity(input: AssessmentInput): Promise<unknown> {
    const ticker = input.ticker.trim().toUpperCase();
    return this.request(`/v1/insider-activity/${encodeURIComponent(ticker)}/assessment`, {
      period: input.period ?? "90d",
      freshness_window_hours: String(input.freshness_window_hours ?? 24)
    });
  }

  async getFilingProvenance(input: FilingProvenanceInput): Promise<unknown> {
    return this.request(
      `/v1/provenance/filing/${encodeURIComponent(input.accession_number)}`
    );
  }

  private async request(
    path: string,
    queryParams: Record<string, string> = {}
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-API-Key": this.apiKey
        },
        signal: controller.signal
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new HeadlessRecordsApiError({
          code: "timeout",
          message: `Headless Records API request timed out after ${this.timeoutMs}ms.`
        });
      }

      throw new HeadlessRecordsApiError({
        code: "network_error",
        message: "Headless Records API request failed before a response was received."
      });
    } finally {
      clearTimeout(timeout);
    }

    const bodyText = await response.text();
    const parsedBody = parseJsonOrUndefined(bodyText);

    if (!response.ok) {
      throw apiErrorFromResponse(response, parsedBody);
    }

    if (parsedBody === undefined) {
      throw new HeadlessRecordsApiError({
        code: "invalid_json",
        message: "Headless Records API returned invalid JSON."
      });
    }

    return parsedBody;
  }
}

export function createClientFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  fetchImpl: FetchLike = fetch
): HeadlessRecordsClient {
  const apiKey = env.HEADLESS_RECORDS_API_KEY;
  if (!apiKey) {
    throw new HeadlessRecordsApiError({
      code: "missing_api_key",
      message: "HEADLESS_RECORDS_API_KEY is required for the Headless Records MCP server."
    });
  }

  const timeoutMs = parseTimeout(env.HEADLESS_RECORDS_TIMEOUT_MS);

  return new HeadlessRecordsClient(
    {
      baseUrl: env.HEADLESS_RECORDS_API_BASE_URL ?? DEFAULT_API_BASE_URL,
      apiKey,
      timeoutMs
    },
    fetchImpl
  );
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.trunc(parsed);
}

function parseJsonOrUndefined(bodyText: string): unknown | undefined {
  if (bodyText.trim() === "") {
    return undefined;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
}

function apiErrorFromResponse(response: Response, body: unknown): HeadlessRecordsApiError {
  const requestId = requestIdFromBody(body);
  const retryAfter = response.headers.get("Retry-After") ?? undefined;

  if (response.status === 401) {
    return new HeadlessRecordsApiError({
      code: "unauthorized",
      status: 401,
      requestId,
      message:
        "Headless Records API key is missing or invalid. Set HEADLESS_RECORDS_API_KEY to a valid design-partner key."
    });
  }

  if (response.status === 429) {
    return new HeadlessRecordsApiError({
      code: "rate_limited",
      status: 429,
      requestId,
      retryAfter,
      message: retryAfter
        ? `Headless Records API rate limit exceeded. Retry later. Retry-After: ${retryAfter} seconds.`
        : "Headless Records API rate limit exceeded. Retry later."
    });
  }

  if (response.status >= 500) {
    return new HeadlessRecordsApiError({
      code: "server_error",
      status: response.status,
      requestId,
      message: requestId
        ? `Headless Records API returned a server error. request_id: ${requestId}.`
        : "Headless Records API returned a server error."
    });
  }

  return new HeadlessRecordsApiError({
    code: "api_error",
    status: response.status,
    requestId,
    message: `Headless Records API returned HTTP ${response.status}.`
  });
}

function requestIdFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("request_id" in body)) {
    return undefined;
  }

  const requestId = (body as { request_id?: unknown }).request_id;
  return typeof requestId === "string" ? requestId : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export { HeadlessRecordsApiError };
