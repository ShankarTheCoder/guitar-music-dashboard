import { useEffect, useRef, useState } from 'react'

const readonly = 'https://www.googleapis.com/auth/youtube.readonly'
const manage = 'https://www.googleapis.com/auth/youtube.force-ssl'
export const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

type Grant = { access_token: string; expires_in: number; scope: string; error?: string }
type OAuth = {
  initTokenClient(config: { client_id: string; scope: string; callback: (grant: Grant) => void; error_callback: () => void }): {
    requestAccessToken(options: { prompt: string }): void
  }
}
declare global { interface Window { google?: { accounts?: { oauth2?: OAuth } } } }

export type Item = {
  id: string
  snippet?: {
    title?: string; channelTitle?: string; channelId?: string; videoOwnerChannelTitle?: string; videoOwnerChannelId?: string
    thumbnails?: { medium?: { url: string }; default?: { url: string } }
    resourceId?: { videoId?: string; channelId?: string }
  }
  contentDetails?: { relatedPlaylists?: { uploads?: string }; videoId?: string }
  rating?: string
}
type Page = { items?: Item[]; nextPageToken?: string }

export type Session = { token: string; writable: boolean; channel?: Item }
export async function youtube<T = Page>(token: string, path: string, params: Record<string,string>, method = 'GET', body?: object): Promise<T> {
  const response = await fetch('https://www.googleapis.com/youtube/v3/' + path + '?' + new URLSearchParams(params), {
    method, cache: 'no-store', credentials: 'omit',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(response.status === 401 ? 'Your Google session expired. Sign in again.' : data.error?.message || 'YouTube could not complete the request.')
  }
  return response.status === 204 ? {} as T : response.json()
}

export function useYouTubeAccount() {
  const [session, setSession] = useState<Session | null>(null)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const version = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function signOut() {
    ++version.current
    clearTimeout(timer.current)
    setSession(null)
    setPending(false)
    setNotice('')
  }
  useEffect(() => () => { ++version.current; clearTimeout(timer.current) }, [])
  function connect(write = false) {
    if (pending) return
    const oauth = window.google?.accounts?.oauth2
    if (!clientId || !oauth) {
      setNotice(clientId ? 'Google sign-in could not load. Check your connection and try again.' : 'Google sign-in is awaiting configuration. You can browse as a guest.')
      return
    }
    const attempt = ++version.current
    setNotice('')
    setPending(true)
    const fail = (message: string) => {
      if (attempt !== version.current) return
      setPending(false)
      setNotice(message)
    }
    try {
      oauth.initTokenClient({
        client_id: clientId, scope: write ? readonly + ' ' + manage : readonly,
        callback: async grant => {
          if (attempt !== version.current) return
          if (grant.error || !grant.access_token) return fail('Google access was declined. You can try again.')
          try {
            const data = await youtube(grant.access_token, 'channels', { part: 'snippet,contentDetails', mine: 'true' })
            if (attempt !== version.current) return
            const writable = grant.scope.split(' ').includes(manage)
            setSession({ token: grant.access_token, writable, channel: data.items?.[0] })
            setPending(false)
            setNotice(write ? writable ? 'Permission granted. Choose the action again to confirm.' : 'YouTube editing permission was declined.' : '')
            clearTimeout(timer.current)
            timer.current = setTimeout(() => { signOut(); setNotice('Your YouTube session expired. Sign in again.') }, Number(grant.expires_in) * 1000)
          } catch (e) { fail(e instanceof Error ? e.message : 'Could not read your channel.') }
        },
        error_callback: () => fail('Sign-in was interrupted. Try again in your browser.'),
      }).requestAccessToken({ prompt: write ? '' : 'select_account' })
    } catch { fail('Could not open Google sign-in.') }
  }
  return { session, pending, notice, connect, signOut, setNotice }
}
