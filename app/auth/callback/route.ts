import { NextResponse } from "next/server";

// Auth foi removido — redireciona para a home.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/`);
}
