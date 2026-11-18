import { NextResponse, type NextRequest } from "next/server";

// Passes the current path to server components so forms can return the user to the same page.
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-url", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next|favicon.ico|api).*)"] };
