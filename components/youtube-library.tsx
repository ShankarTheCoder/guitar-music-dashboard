import { useEffect, useRef, useState } from 'react'
import { youtube, type Item, type Session } from '@/lib/youtube-account'

export type Collection = 'liked' | 'subscriptions' | 'playlists' | 'uploads'
type Props = { session: Session; collection: Collection; authorize: () => void; onChannel: (id: string, title: string) => void; onPlay: (items: Item[], index: number) => void }

export function YouTubeLibrary({ session, collection, authorize, onChannel, onPlay }: Props) {
  const [playlist, setPlaylist] = useState<{ id: string; title: string } | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const request = useRef(0)
  const titles = { liked: 'Liked videos', subscriptions: 'Subscriptions', playlists: 'Playlists', uploads: 'Your videos' }
  const playlistId = playlist?.id || (collection === 'uploads' && session.channel?.contentDetails?.relatedPlaylists?.uploads)
  async function load(pageToken = '') {
    const current = ++request.current
    setBusy(true)
    setError('')
    try {
      let path = 'playlistItems'
      const params: Record<string,string> = { part: 'snippet,contentDetails', maxResults: '24' }
      if (playlistId) params.playlistId = playlistId
      else if (collection === 'uploads') { setItems([]); setNext(''); return }
      else if (collection === 'liked') { path = 'videos'; params.myRating = 'like' }
      else { path = collection; params.mine = 'true' }
      if (pageToken) params.pageToken = pageToken
      const data = await youtube(session.token, path, params)
      if (current !== request.current) return
      setItems(old => pageToken ? [...old, ...(data.items || [])] : data.items || [])
      setNext(data.nextPageToken || '')
    } catch (e) { if (current === request.current) setError((e as Error).message) }
    finally { if (current === request.current) setBusy(false) }
  }
  useEffect(() => {
    setItems([]); setNext(''); void load()
    return () => { ++request.current }
  }, [session.token, collection, playlistId])
  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!session.writable) return authorize()
    if (!name.trim() || busy) return
    setBusy(true); setError('')
    try {
      await youtube(session.token, 'playlists', { part: 'snippet,status' }, 'POST', { snippet: { title: name.trim() }, status: { privacyStatus: 'private' } })
      setName(''); await load()
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return <section className="account-library">
    {playlist && <button className="yt-pill" onClick={() => setPlaylist(null)}>Back to playlists</button>}
    <div className="yt-page-head"><h1>{playlist?.title || titles[collection]}</h1>
      {collection === 'uploads' && <a href="https://studio.youtube.com" target="_blank" rel="noreferrer">Upload in YouTube Studio ↗</a>}
    </div>
    {collection === 'playlists' && !playlist && <form onSubmit={create} className="account-form">
      <input aria-label="New playlist name" placeholder="New private playlist" maxLength={150} value={name} onChange={e => setName(e.target.value)} />
      <button disabled={!name.trim() || busy}>Create playlist</button></form>}
    {error && <p role="alert">{error} <button onClick={() => load(next)}>Retry</button></p>}
    {!busy && !items.length && !error && <p className="yt-empty-note">No items in this collection.</p>}
    <div className="yt-grid">{items.map((item,index) => <button className="yt-card" key={item.id} onClick={() => {
      if (collection === 'subscriptions') { const id = item.snippet?.resourceId?.channelId; if (id) onChannel(id, item.snippet?.title || '') }
      else if (collection === 'playlists' && !playlist) setPlaylist({ id: item.id, title: item.snippet?.title || 'Playlist' })
      else onPlay(items, index)
    }}>
      <span className="yt-thumb">{item.snippet?.thumbnails?.medium?.url && <img alt="" loading="lazy" src={item.snippet.thumbnails.medium.url} />}</span>
      <span className="yt-card-text"><strong>{item.snippet?.title}</strong><small>{item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle}</small></span>
    </button>)}</div>
    {busy && <p role="status">Loading…</p>}
    {next && <button className="yt-load-more" disabled={busy} onClick={() => load(next)}>Load more</button>}
  </section>
}
