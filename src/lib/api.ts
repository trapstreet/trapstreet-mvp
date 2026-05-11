import { NextResponse } from "next/server";
import type { ApiError } from "./types";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(
  code: ApiError["code"],
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: message, code } satisfies ApiError,
    { status },
  );
}

export const ERR = {
  invalid: (m: string) => err("INVALID_REQUEST", m, 400),
  unauthorized: () => err("UNAUTHORIZED", "missing or invalid api_key", 401),
  forbidden: (m = "forbidden") => err("FORBIDDEN", m, 403),
  notFound: (m = "not found") => err("NOT_FOUND", m, 404),
  conflict: (m: string) => err("CONFLICT", m, 409),
  internal: (m = "internal error") => err("INTERNAL", m, 500),
};
