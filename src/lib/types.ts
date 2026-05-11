// Wire-only types. Resource shapes live in db/schema.ts and are inferred via
// TaskRow / RunRow / etc. — Drizzle's Date columns serialize to ISO strings
// automatically via NextResponse.json, so we don't redefine them here.

export interface ApiError {
  error: string;
  code:
    | "INVALID_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL";
}

export interface CreateRunnerResponse {
  runner: {
    id: string;
    name: string;
    endpoint_url: string;
    created_at: string | Date;
  };
  api_key: string;
}
