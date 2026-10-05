import { NextResponse } from "next/server";

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

export function middleware(req) {
  const [scheme, enc] = (req.headers.get("authorization") || "").split(" ");
  if (scheme === "Basic" && enc) {
    const dec = atob(enc);
    const i = dec.indexOf(":");
    if (dec.slice(0, i) === process.env.APP_USER && dec.slice(i + 1) === process.env.APP_PASS)
      return NextResponse.next();
  }
  return new NextResponse("Login diperlukan", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dehikas Purchase Import"' },
  });
}
