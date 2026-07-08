const SECRET_PATTERN = /hr_live_[A-Za-z0-9._-]+/g;

export type HeadlessRecordsErrorCode =
  | "missing_api_key"
  | "unauthorized"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "invalid_json"
  | "api_error"
  | "network_error"
  | "invalid_input";

export class HeadlessRecordsApiError extends Error {
  readonly code: HeadlessRecordsErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryAfter?: string;

  constructor(input: {
    code: HeadlessRecordsErrorCode;
    message: string;
    status?: number;
    requestId?: string;
    retryAfter?: string;
  }) {
    super(redactSecrets(input.message));
    this.name = "HeadlessRecordsApiError";
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.retryAfter = input.retryAfter;
  }
}

export function redactSecrets(value: string): string {
  return value.replaceAll(SECRET_PATTERN, "[redacted-api-key]");
}

export function errorToJson(error: unknown): Record<string, unknown> {
  if (error instanceof HeadlessRecordsApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.status === undefined ? {} : { status: error.status }),
        ...(error.requestId === undefined ? {} : { request_id: error.requestId }),
        ...(error.retryAfter === undefined ? {} : { retry_after: error.retryAfter })
      }
    };
  }

  if (error instanceof Error) {
    return {
      error: {
        code: "api_error",
        message: redactSecrets(error.message)
      }
    };
  }

  return {
    error: {
      code: "api_error",
      message: "Headless Records MCP tool failed."
    }
  };
}
