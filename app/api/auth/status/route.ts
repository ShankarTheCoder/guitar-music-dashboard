import { NextResponse } from 'next/server'

// Lets the UI know whether Google sign-in is actually configured,
// without ever exposing any secret.
export async function GET() {
  return NextResponse.json({
    googleConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    ),
  })
}
