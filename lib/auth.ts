import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

// Google sign-in is only wired up when the site owner has configured it.
// Until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set (in Vercel env vars),
// the app shows a setup notice instead of a broken sign-in button.
const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
)

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: googleConfigured ? [Google] : [],
})
