import { NextResponse } from "next/server";

export function jsonOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}
