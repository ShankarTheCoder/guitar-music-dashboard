import { useEffect, useState } from 'react'
import { youtube, type Session, type Item } from '@/lib/youtube-account'

type Access = { session: Session; authorize: () => void }
export function YouTubeToggle({ session, authorize, videoId, channelId }: Access & { videoId?: string; channelId?: string }) {
  const [value, setValue] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let live = true
    setValue(null); setError('')
    async function read() {
      const result = videoId
        ? await youtube(session.token, 'videos/getRating', { id: videoId })
        : await youtube(session.token, 'subscriptions', { mine: 'true', forChannelId: channelId!, part: 'id' })
      if (live) setValue(videoId ? result.items?.[0]?.rating === 'like' ? 'like' : '' : result.items?.[0]?.id || '')
    }
    read().catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [session.token, videoId, channelId, retry])
  async function change() {
    if (!session.writable) return authorize()
    setBusy(true); setError('')
    try {
      if (videoId) {
        await youtube(session.token, 'videos/rate', { id: videoId, rating: value ? 'none' : 'like' }, 'POST')
        setValue(value ? '' : 'like')
      } else if (value) {
        await youtube(session.token, 'subscriptions', { id: value }, 'DELETE')
        setValue('')
      } else {
        const created = await youtube<Item>(session.token, 'subscriptions', { part: 'snippet' }, 'POST', { snippet: { resourceId: { kind: 'youtube#channel', channelId } } })
        setValue(created.id)
      }
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <><button className={'yt-pill' + (value ? ' active' : '')} disabled={value === null || busy} aria-pressed={!!value} onClick={change}>
    {videoId ? value ? 'Liked' : 'Like' : value ? 'Subscribed' : 'Subscribe'}
  </button>{error && <small role="alert">{error} <button onClick={() => setRetry(v => v + 1)}>Retry</button></small>}</>
}

export function PlaylistSave({ session, authorize, videoId }: Access & { videoId: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  async function show(page = '') {
    setOpen(true); setBusy(true); setNote('')
    try {
      const result = await youtube(session.token, 'playlists', { part: 'snippet', mine: 'true', maxResults: '50', ...(page ? { pageToken: page } : {}) })
      setItems(old => page ? [...old, ...(result.items || [])] : result.items || [])
      setNext(result.nextPageToken || '')
      if (!result.items?.length && !page) setNote('Create a playlist in Your library first.')
    } catch (e) { setNote((e as Error).message) } finally { setBusy(false) }
  }
  async function save(playlistId: string) {
    if (!playlistId) return
    if (!session.writable) return authorize()
    setBusy(true)
    try {
      await youtube(session.token, 'playlistItems', { part: 'snippet' }, 'POST', { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } })
      setOpen(false); setNote('Added to playlist.')
    } catch (e) { setNote((e as Error).message) } finally { setBusy(false) }
  }
  return <><button className="yt-pill" disabled={busy} onClick={() => open ? setOpen(false) : show()}>Save to playlist</button>
    {open && <><select className="account-select" aria-label="Choose a playlist" disabled={busy} value="" onChange={e => save(e.target.value)}>
      <option value="">Choose a playlist</option>{items.map(p => <option key={p.id} value={p.id}>{p.snippet?.title}</option>)}
    </select>{next && <button disabled={busy} onClick={() => show(next)}>More playlists</button>}</>}
    {note && <small role="status">{note}</small>}</>
}

export function CommentForm({ session, authorize, videoId, channelId, onPosted }: Access & { videoId: string; channelId: string; onPosted: () => void }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  return <form className="account-form" onSubmit={async e => {
    e.preventDefault()
    if (!session.writable) return authorize()
    if (!message.trim() || busy) return
    setBusy(true); setNote('')
    try {
      const owner = channelId || (await youtube(session.token, 'videos', { id: videoId, part: 'snippet' })).items?.[0]?.snippet?.channelId
      if (!owner) throw new Error('Could not identify the channel for this video.')
      await youtube(session.token, 'commentThreads', { part: 'snippet' }, 'POST', { snippet: { videoId, channelId: owner, topLevelComment: { snippet: { textOriginal: message.trim() } } } })
      setMessage(''); setNote('Comment submitted to YouTube.'); onPosted()
    } catch (e) { setNote((e as Error).message) } finally { setBusy(false) }
  }}>
    <input aria-label="Public comment" placeholder="Add a public comment…" value={message} maxLength={10000} onChange={e => setMessage(e.target.value)} />
    <button disabled={!message.trim() || busy}>Post comment</button>{note && <small role="status">{note}</small>}
  </form>
}
