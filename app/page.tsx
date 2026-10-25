'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bell, Bookmark, ChevronLeft, ChevronRight, ChevronUp, Clock, Flame, History, Home, LoaderCircle,
  Menu, MessageSquare, Mic, Music2, Pause, Play, Search, Share2, SkipBack, SkipForward,
  ThumbsUp, Trash2, Users, X,
} from 'lucide-react'

type Result = {
  id: string; title: string; channel: string; channelId: string; thumbnail: string; duration: string
  viewCount?: string; publishedAt?: string; description?: string
}
type Channel = { id: string; name: string }
type Comment = { id: string; author: string; authorImage: string; text: string; likes: number; publishedAt: string }
type View = 'home' | 'history' | 'liked' | 'trending' | 'subscriptions' | 'watchlater' | 'channel'

const HISTORY_KEY = 'playtube-history'
const LIKED_KEY = 'playtube-liked'
const WATCH_LATER_KEY = 'playtube-watchlater'
const SUBS_KEY = 'playtube-subscriptions'
const CHIPS = ['All', 'Music', 'Bollywood', 'Bhojpuri', 'Punjabi', 'Arijit Singh', 'Old Classics', 'New Releases', 'Live']

function loadStored<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveStored(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

function normalize(video: Partial<Result> & { id: string }): Result {
  return {
    id: video.id,
    title: video.title ?? '',
    channel: video.channel ?? '',
    channelId: video.channelId ?? '',
    thumbnail: video.thumbnail ?? '',
    duration: video.duration ?? '—',
    viewCount: video.viewCount ?? '',
    publishedAt: video.publishedAt ?? '',
    description: video.description ?? '',
  }
}

function formatViews(viewCount?: string) {
  const n = Number(viewCount ?? 0)
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K views`
  return `${n} views`
}

function formatDate(publishedAt?: string) {
  if (!publishedAt) return ''
  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Page() {
  const [query, setQuery] = useState('')
  const [queue, setQueue] = useState<Result[]>([])
  // Player state is separate from the feed: the feed list (queue) can be
  // searched and browsed while a song keeps playing in the mini-player.
  const [playerQueue, setPlayerQueue] = useState<Result[]>([])
  const [playerIndex, setPlayerIndex] = useState(-1)
  const [minimized, setMinimized] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  // The exact list "Load more" continues: the search or channel that produced
  // the current feed. (Using the search box text here would be wrong — the
  // user may have typed something new without submitting, and a channel page
  // has no search text at all.)
  const [moreBase, setMoreBase] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)
  const [view, setView] = useState<View>('home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [history, setHistory] = useState<Result[]>([])
  const [liked, setLiked] = useState<Result[]>([])
  const [watchLater, setWatchLater] = useState<Result[]>([])
  const [subscriptions, setSubscriptions] = useState<Channel[]>([])
  const [channelView, setChannelView] = useState<Channel | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsFailed, setCommentsFailed] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [shareNote, setShareNote] = useState('')
  const [homeHead, setHomeHead] = useState('Recommended for you')

  const recognitionRef = useRef<{
    start: () => void; stop: () => void; lang: string; interimResults: boolean; continuous: boolean
    onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null
    onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null
    onstart?: (() => void) | null; onnomatch?: (() => void) | null
  } | null>(null)
  const videoRef = useRef<HTMLIFrameElement>(null)
  const watchRef = useRef<HTMLElement>(null)
  const queueRef = useRef<Result[]>([])
  const playerQueueRef = useRef<Result[]>([])
  const playerIndexRef = useRef(-1)
  const historyRef = useRef<Result[]>([])
  const likedRef = useRef<Result[]>([])
  const watchLaterRef = useRef<Result[]>([])
  const subsRef = useRef<Channel[]>([])
  // List the playing video came from, so Back returns there.
  const backViewRef = useRef<View>('home')
  const minimizedRef = useRef(false)
  const playerVideoRef = useRef<Result | null>(null)
  const sidebarOpenRef = useRef(false)

  const playerVideo = playerIndex >= 0 ? playerQueue[playerIndex] : null
  const upNext = playerVideo ? playerQueue.slice(playerIndex + 1) : []
  const canPrev = playerIndex > 0
  const canNext = playerVideo != null && playerIndex < playerQueue.length - 1
  const isLiked = playerVideo ? liked.some((v) => v.id === playerVideo.id) : false
  const isSavedLater = playerVideo ? watchLater.some((v) => v.id === playerVideo.id) : false
  const isSubscribed = playerVideo && playerVideo.channelId ? subscriptions.some((c) => c.id === playerVideo.channelId) : false
  const selectedChannel: Channel | null = playerVideo && playerVideo.channelId ? { id: playerVideo.channelId, name: playerVideo.channel } : null

  function syncQueue(list: Result[]) {
    queueRef.current = list
    setQueue(list)
  }

  function rememberPlayed(video: Result) {
    const updated = [video, ...historyRef.current.filter((v) => v.id !== video.id)].slice(0, 100)
    historyRef.current = updated
    setHistory(updated)
    saveStored(HISTORY_KEY, updated)
  }

  function playAt(index: number) {
    const video = playerQueueRef.current[index]
    if (!video) return
    playerIndexRef.current = index
    setPlayerIndex(index)
    setPlaying(true)
    setView('home')
    setDescExpanded(false)
    rememberPlayed(video)
  }

  function playVideo(video: Result, list: Result[]) {
    const index = list.findIndex((v) => v.id === video.id)
    if (index < 0) return
    backViewRef.current = view
    playerQueueRef.current = list
    setPlayerQueue(list)
    minimizedRef.current = false
    setMinimized(false)
    playAt(index)
  }

  function playNext() {
    if (playerIndexRef.current < playerQueueRef.current.length - 1) playAt(playerIndexRef.current + 1)
  }

  function playPrev() {
    if (playerIndexRef.current > 0) playAt(playerIndexRef.current - 1)
  }

  function minimizePlayer() {
    minimizedRef.current = true
    setMinimized(true)
  }

  // Back from the watch view: the song keeps playing in the mini-player
  // and the user returns to the list the video came from, free to search
  // another song.
  function exitWatch() {
    minimizePlayer()
    setView(backViewRef.current ?? 'home')
  }

  function expandPlayer() {
    minimizedRef.current = false
    setMinimized(false)
    setView('home')
  }

  function closePlayer() {
    playerQueueRef.current = []
    playerIndexRef.current = -1
    setPlayerQueue([])
    setPlayerIndex(-1)
    setPlaying(false)
    minimizedRef.current = false
    setMinimized(false)
  }

  function toggleInList(list: Result[], ref: { current: Result[] }, set: (v: Result[]) => void, key: string, video: Result) {
    const updated = list.some((v) => v.id === video.id) ? list.filter((v) => v.id !== video.id) : [video, ...list]
    ref.current = updated
    set(updated)
    saveStored(key, updated)
  }

  function toggleLike() {
    if (playerVideo) toggleInList(liked, likedRef, setLiked, LIKED_KEY, playerVideo)
  }

  function toggleWatchLater() {
    if (playerVideo) toggleInList(watchLater, watchLaterRef, setWatchLater, WATCH_LATER_KEY, playerVideo)
  }

  function toggleSubscribe(channel: Channel | null) {
    if (!channel || !channel.id) return
    const updated = subsRef.current.some((c) => c.id === channel.id)
      ? subsRef.current.filter((c) => c.id !== channel.id)
      : [channel, ...subsRef.current]
    subsRef.current = updated
    setSubscriptions(updated)
    saveStored(SUBS_KEY, updated)
  }

  async function shareVideo() {
    if (!playerVideo) return
    const url = `https://www.youtube.com/watch?v=${playerVideo.id}`
    try {
      if (navigator.share) await navigator.share({ title: playerVideo.title, url })
      else {
        await navigator.clipboard.writeText(url)
        setShareNote('Link copied')
        window.setTimeout(() => setShareNote(''), 2000)
      }
    } catch { /* share dismissed */ }
  }

  function clearHistory() {
    historyRef.current = []
    setHistory([])
    try { window.localStorage.removeItem(HISTORY_KEY) } catch { /* storage unavailable */ }
  }

  function removeFromHistory(id: string) {
    const updated = historyRef.current.filter((v) => v.id !== id)
    historyRef.current = updated
    setHistory(updated)
    saveStored(HISTORY_KEY, updated)
  }

  async function runSearch(searchText: string) {
    const value = searchText.trim()
    if (!value) return
    if (playerVideo) minimizePlayer()
    setLoading(true)
    setError('')
    setView('home')
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(value)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Search failed')
      syncQueue((data.items ?? []).map(normalize))
      setNextPageToken(data.nextPageToken ?? null)
      setMoreBase(`/api/youtube/search?q=${encodeURIComponent(value)}`)
    } catch (searchError) {
      syncQueue([])
      setMoreBase(null)
      setError(searchError instanceof Error ? searchError.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function searchYouTube(event: React.FormEvent, submittedQuery = query) {
    event.preventDefault()
    await runSearch(submittedQuery)
  }

  async function loadMore() {
    if (!nextPageToken || loading || !moreBase) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${moreBase}&pageToken=${encodeURIComponent(nextPageToken)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not load more videos')
      const updated = [...queueRef.current, ...(data.items ?? []).map(normalize)]
      queueRef.current = updated
      setQueue(updated)
      setNextPageToken(data.nextPageToken ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load more videos')
    } finally {
      setLoading(false)
    }
  }

  async function loadTrending() {
    if (playerVideo) minimizePlayer()
    setLoading(true)
    setError('')
    setView('trending')
    try {
      const response = await fetch('/api/youtube/trending')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not load trending videos')
      syncQueue((data.items ?? []).map(normalize))
      setNextPageToken(null)
      setMoreBase(null)
    } catch (trendError) {
      syncQueue([])
      setError(trendError instanceof Error ? trendError.message : 'Could not load trending videos')
    } finally {
      setLoading(false)
    }
  }

  async function openChannel(channel: Channel) {
    if (!channel.id) return
    if (playerVideo) minimizePlayer()
    setChannelView(channel)
    setView('channel')
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/youtube/search?channelId=${encodeURIComponent(channel.id)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not load channel videos')
      syncQueue((data.items ?? []).map(normalize))
      setNextPageToken(data.nextPageToken ?? null)
      setMoreBase(`/api/youtube/search?channelId=${encodeURIComponent(channel.id)}`)
    } catch (channelError) {
      syncQueue([])
      setMoreBase(null)
      setError(channelError instanceof Error ? channelError.message : 'Could not load channel videos')
    } finally {
      setLoading(false)
    }
  }

  async function toggleVoiceSearch() {
    // In the PlayTube Android app, the mic is handled by the phone itself
    // (Android's own speech recognizer, bridged in as window.PlayTubeMic),
    // because an app WebView does not reliably provide web speech recognition.
    // In a normal browser this block is skipped and web speech is used below.
    const nativeWindow = window as typeof window & {
      PlayTubeMic?: { startListening: () => void; stopListening: () => void }
      __playtubeMicResult?: (transcript: string) => void
      __playtubeMicError?: (code: string) => void
    }
    const nativeMic = nativeWindow.PlayTubeMic
    if (listening) {
      if (nativeMic) {
        try { nativeMic.stopListening() } catch { /* already stopped */ }
      }
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    if (nativeMic && typeof nativeMic.startListening === 'function') {
      setError('')
      nativeWindow.__playtubeMicResult = (transcript: string) => {
        setListening(false)
        const value = (transcript ?? '').trim()
        if (!value) {
          setError('I could not understand that. Please try again.')
          return
        }
        setQuery(value)
        void runSearch(value)
      }
      nativeWindow.__playtubeMicError = (code: string) => {
        setListening(false)
        if (code === 'no-speech') setError('No speech detected. Tap the microphone and speak clearly.')
        else if (code === 'not-allowed') setError('Microphone access is blocked. Allow microphone access for PlayTube, then try again.')
        else if (code === 'not-supported') setError('Voice search is not available on this device. Type your song title instead.')
        else setError('Voice search could not start. Try the microphone again.')
      }
      try {
        nativeMic.startListening()
        setListening(true)
      } catch {
        setListening(false)
        setError('Voice search could not start. Tap the microphone again.')
      }
      return
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => NonNullable<typeof recognitionRef.current>
      webkitSpeechRecognition?: new () => NonNullable<typeof recognitionRef.current>
    }
    const SpeechRecognitionClass = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!window.isSecureContext) {
      setError('Voice search requires HTTPS. Open the deployed HTTPS address and allow microphone access.')
      return
    }
    if (!SpeechRecognitionClass) {
      setVoiceSupported(false)
      setError('Voice search is supported in Chrome, Edge, and Safari. Firefox does not provide speech recognition yet; type your song title instead.')
      return
    }
    setVoiceSupported(true)
    recognitionRef.current?.stop()
    const recognition = new SpeechRecognitionClass()
    recognition.lang = navigator.language || 'en-US'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? ''
      setListening(false)
      if (!transcript) {
        setError('I could not understand that. Please try again.')
        return
      }
      setQuery(transcript)
      void runSearch(transcript)
    }
    recognition.onstart = () => { setListening(true); setError('') }
    recognition.onnomatch = () => {
      setListening(false)
      setError('I could not understand that. Please try again.')
    }
    recognition.onend = () => { setListening(false); recognitionRef.current = null }
    recognition.onerror = (event) => {
      setListening(false)
      recognitionRef.current = null
      const code = event.error
      if (code === 'not-allowed' || code === 'service-not-allowed') setError('Microphone access is blocked. Allow microphone access for this deployed site, then try again.')
      else if (code === 'audio-capture') setError('No microphone was detected. Connect a microphone and try again.')
      else if (code === 'no-speech') setError('No speech detected. Tap the microphone and speak clearly.')
      else setError('Voice search could not start. Try the microphone again.')
    }
    recognitionRef.current = recognition
    setError('')
    try {
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
      recognitionRef.current = null
      setError('Voice search could not start. Tap the microphone again.')
    }
  }

  function clearSearch() {
    recognitionRef.current?.stop()
    setListening(false)
    setQuery('')
    syncQueue([])
    setNextPageToken(null)
    setMoreBase(null)
    setError('')
  }

  // Home (or the logo) always reloads the home feed — recommendations,
  // not a fixed search — and leaves any playing video behind.
  function goHome() {
    setSidebarOpen(false)
    void loadHomeFeed(historyRef.current, likedRef.current)
  }

  function sendPlayerCommand(func: 'playVideo' | 'pauseVideo') {
    const player = videoRef.current?.contentWindow
    if (!player) return
    const message = JSON.stringify({ event: 'command', func, args: [] })
    player.postMessage(message, 'https://www.youtube.com')
    player.postMessage(message, 'https://www.youtube-nocookie.com')
  }

  function startVideoPlayback() {
    if (!playing) setPlaying(true)
    const player = videoRef.current?.contentWindow
    if (!player) return
    const setup = JSON.stringify({ event: 'listening', id: '1', channel: 'channel' })
    const listener = JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] })
    player.postMessage(setup, 'https://www.youtube.com')
    player.postMessage(listener, 'https://www.youtube.com')
    player.postMessage(setup, 'https://www.youtube-nocookie.com')
    player.postMessage(listener, 'https://www.youtube-nocookie.com')
    window.setTimeout(() => sendPlayerCommand('playVideo'), 150)
    window.setTimeout(() => sendPlayerCommand('playVideo'), 600)
  }

  function togglePlayPause() {
    if (!playerVideo) return
    if (playing) {
      sendPlayerCommand('pauseVideo')
      setPlaying(false)
    } else {
      sendPlayerCommand('playVideo')
      setPlaying(true)
    }
  }

  // Home feed, YouTube-style: the starting page IS the recommendations,
  // not a fixed search. Built from the channels the user watches most
  // (history + liked, kept on this device only), mixed together so no
  // single channel owns the feed; trending when there is no watch
  // history yet. Search and chips still work exactly as before.
  async function loadHomeFeed(hist: Result[], likedList: Result[]) {
    const counts = new Map<string, { name: string; n: number }>()
    for (const video of [...hist, ...likedList]) {
      if (!video.channelId) continue
      const entry = counts.get(video.channelId) ?? { name: video.channel, n: 0 }
      entry.n += 1
      counts.set(video.channelId, entry)
    }
    const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3)
    if (playerVideo) minimizePlayer()
    setLoading(true)
    setError('')
    setView('home')
    setQuery('')
    try {
      if (top.length > 0) {
        const lists = await Promise.all(top.map(async ([channelId]) => {
          try {
            const response = await fetch(`/api/youtube/search?channelId=${encodeURIComponent(channelId)}`)
            const data = await response.json()
            return response.ok ? (data.items as unknown[]).map(normalize) : []
          } catch { return [] }
        }))
        const mixed: Result[] = []
        const seen = new Set<string>()
        let round = 0
        let added = true
        while (added && mixed.length < 30) {
          added = false
          for (const list of lists) {
            const video = list[round]
            if (video && !seen.has(video.id)) { seen.add(video.id); mixed.push(video); added = true }
          }
          round += 1
        }
        if (mixed.length > 0) {
          syncQueue(mixed)
          setHomeHead('Recommended for you')
          setNextPageToken(null)
          setMoreBase(null)
          return
        }
      }
      const response = await fetch('/api/youtube/trending')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not load home feed')
      syncQueue((data.items as unknown[]).map(normalize))
      setHomeHead('Trending in India')
      setNextPageToken(null)
      setMoreBase(null)
    } catch (homeError) {
      syncQueue([])
      setError(homeError instanceof Error ? homeError.message : 'Could not load home feed')
    } finally {
      setLoading(false)
    }
  }

  // First open: restore on-device lists, then load the home feed.
  useEffect(() => {
    const storedHistory = loadStored<Result>(HISTORY_KEY)
    const storedLiked = loadStored<Result>(LIKED_KEY)
    const storedLater = loadStored<Result>(WATCH_LATER_KEY)
    const storedSubs = loadStored<Channel>(SUBS_KEY)
    historyRef.current = storedHistory
    likedRef.current = storedLiked
    watchLaterRef.current = storedLater
    subsRef.current = storedSubs
    setHistory(storedHistory)
    setLiked(storedLiked)
    setWatchLater(storedLater)
    setSubscriptions(storedSubs)
    void loadHomeFeed(storedHistory, storedLiked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Comments for the playing video.
  useEffect(() => {
    if (!playerVideo) {
      setComments([])
      return
    }
    let cancelled = false
    setCommentsFailed(false)
    fetch(`/api/youtube/comments?videoId=${encodeURIComponent(playerVideo.id)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (ok) setComments(data.items ?? [])
        else setCommentsFailed(true)
      })
      .catch(() => { if (!cancelled) setCommentsFailed(true) })
    return () => { cancelled = true }
  }, [playerVideo])

  // Scroll to the player only when the full watch view opens, never when
  // it shrinks to the mini-player.
  useEffect(() => {
    if (playerVideo && !minimized) watchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [playerVideo, minimized])

  // MediaSession (headset / notification controls) for the playing video.
  useEffect(() => {
    if ('mediaSession' in navigator && playerVideo) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: playerVideo.title,
        artist: playerVideo.channel,
        album: 'PlayTube',
      })
      navigator.mediaSession.setActionHandler('nexttrack', playNext)
      navigator.mediaSession.setActionHandler('previoustrack', playPrev)
      navigator.mediaSession.setActionHandler('play', () => sendPlayerCommand('playVideo'))
      navigator.mediaSession.setActionHandler('pause', () => sendPlayerCommand('pauseVideo'))
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    }
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerVideo, playing])

  // Phone back button inside the APK (window.__playtubeGoBack): first
  // press leaves the watch view with the song still playing in the
  // mini-player, instead of closing the app.
  useEffect(() => {
    playerVideoRef.current = playerVideo
    sidebarOpenRef.current = sidebarOpen
    minimizedRef.current = minimized
    ;(window as unknown as { __playtubeGoBack?: () => boolean }).__playtubeGoBack = () => {
      if (sidebarOpenRef.current) {
        setSidebarOpen(false)
        sidebarOpenRef.current = false
        return true
      }
      if (playerVideoRef.current && !minimizedRef.current) {
        exitWatch()
        return true
      }
      return false
    }
  })

  useEffect(() => {
    const handleYouTubeMessage = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com')) return
      let message: { event?: string; info?: number }
      try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data } catch { return }
      if (message.event !== 'onStateChange' || message.info !== 0) return
      if (playerIndexRef.current < playerQueueRef.current.length - 1) playAt(playerIndexRef.current + 1)
      else setPlaying(false)
    }
    window.addEventListener('message', handleYouTubeMessage)
    return () => window.removeEventListener('message', handleYouTubeMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chipSearch(chip: string) {
    if (chip === 'All') {
      void loadHomeFeed(historyRef.current, likedRef.current)
      return
    }
    setQuery(chip)
    void runSearch(chip)
  }

  function openView(next: View) {
    if (playerVideo) minimizePlayer()
    setView(next)
    setSidebarOpen(false)
    if (next !== 'channel') setChannelView(null)
  }

  function videoCard(video: Result, list: Result[]) {
    const meta = [formatViews(video.viewCount), formatDate(video.publishedAt)].filter(Boolean).join(' • ')
    return (
      <button className="yt-card" key={video.id} onClick={() => playVideo(video, list)}>
        <span className="yt-thumb">
          {video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" />}
          <i><Play size={16} fill="currentColor" /></i>
          <b>{video.duration}</b>
        </span>
        <span className="yt-card-text"><strong>{video.title}</strong><small>{video.channel}{meta ? ` • ${meta}` : ''}</small></span>
      </button>
    )
  }


  return (
    <div className="yt-app">
      <header className="yt-topbar">
        <button className="yt-icon-btn" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Menu"><Menu size={22} /></button>
        <button className="yt-logo" type="button" onClick={goHome} aria-label="PlayTube home">
          <span><Play size={18} fill="currentColor" /></span><strong>PlayTube</strong>
        </button>
        <form className="yt-search" onSubmit={searchYouTube}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search" />
          {query.trim() && <button className="yt-search-clear" type="button" onClick={clearSearch} aria-label="Clear search"><X size={17} /></button>}
          <button className="yt-search-btn" type="submit" disabled={loading || !query.trim()} aria-label="Search"><Search size={19} /></button>
        </form>
        <button
          className={`yt-icon-btn yt-mic ${listening ? 'is-listening' : ''}`}
          type="button"
          onClick={toggleVoiceSearch}
          aria-label={listening ? 'Stop voice search' : voiceSupported ? 'Search by voice' : 'Voice search is unavailable in this browser'}
          title={listening ? 'Stop voice search' : voiceSupported ? 'Search by voice' : 'Voice search works in Chrome, Edge, and Safari'}
        ><Mic size={20} /></button>
      </header>

      <div className="yt-body">
        <aside className={`yt-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <button className={view === 'home' ? 'active' : ''} type="button" onClick={goHome}><Home size={20} /><span>Home</span></button>
          <button className={view === 'trending' ? 'active' : ''} type="button" onClick={() => { setSidebarOpen(false); void loadTrending() }}><Flame size={20} /><span>Trending</span></button>
          <button className={view === 'subscriptions' ? 'active' : ''} type="button" onClick={() => openView('subscriptions')}><Users size={20} /><span>Subscriptions</span></button>
          <button className={view === 'history' ? 'active' : ''} type="button" onClick={() => openView('history')}><History size={20} /><span>History</span></button>
          <button className={view === 'watchlater' ? 'active' : ''} type="button" onClick={() => openView('watchlater')}><Clock size={20} /><span>Watch Later</span></button>
          <button className={view === 'liked' ? 'active' : ''} type="button" onClick={() => openView('liked')}><ThumbsUp size={20} /><span>Liked videos</span></button>
          <p className="yt-side-note">History, liked videos, Watch Later and subscriptions stay on this device.</p>
        </aside>
        {sidebarOpen && <button className="yt-scrim" type="button" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}

        <main className="yt-main">
          {view === 'home' && (
            <nav className="yt-chips" aria-label="Categories">
              {CHIPS.map((chip) => (
                <button key={chip} type="button" className={query === chip || (chip === 'All' && query === '' && queue.length > 0) ? 'active' : ''} onClick={() => chipSearch(chip)}>{chip}</button>
              ))}
            </nav>
          )}

          {error && <p className="yt-error" role="alert">{error}</p>}

          {playerVideo && (
            <section ref={watchRef} className={minimized ? 'yt-watch yt-watch-min' : 'yt-watch'}>
              <div className="yt-player-col">
                <div className="yt-watch-back"><button type="button" onClick={exitWatch}><ChevronLeft size={18} /> Back</button></div>
                <div className="yt-player">
                  <iframe
                    ref={videoRef}
                    onLoad={startVideoPlayback}
                    src={`https://www.youtube.com/embed/${playerVideo.id}?enablejsapi=1&autoplay=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}&rel=0`}
                    title={playerVideo.title}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <h1 className="yt-watch-title">{playerVideo.title}</h1>
                <div className="yt-channel-row">
                  <span className="yt-channel-avatar">{(playerVideo.channel || '?').trim().charAt(0).toUpperCase()}</span>
                  <span className="yt-channel-meta">
                    {selectedChannel
                      ? <button type="button" onClick={() => openChannel(selectedChannel)}>{playerVideo.channel}</button>
                      : <strong>{playerVideo.channel}</strong>}
                    <small>{[formatViews(playerVideo.viewCount), formatDate(playerVideo.publishedAt)].filter(Boolean).join(' • ')}</small>
                  </span>
                  <button
                    className={`yt-subscribe ${isSubscribed ? 'subscribed' : ''}`}
                    type="button"
                    onClick={() => toggleSubscribe(selectedChannel)}
                    disabled={!selectedChannel}
                  ><Bell size={16} /> {isSubscribed ? 'Subscribed' : 'Subscribe'}</button>
                </div>
                {playerVideo.description && (
                  <div className="yt-desc">
                    <p>{descExpanded ? playerVideo.description : `${playerVideo.description.slice(0, 200)}${playerVideo.description.length > 200 ? '…' : ''}`}</p>
                    {playerVideo.description.length > 200 && <button type="button" onClick={() => setDescExpanded((v) => !v)}>{descExpanded ? 'Show less' : '…more'}</button>}
                  </div>
                )}
                <div className="yt-watch-actions">
                  <div className="yt-transport" aria-label="Playback controls">
                    <button type="button" onClick={playPrev} disabled={!canPrev} aria-label="Previous video"><SkipBack size={20} fill="currentColor" /></button>
                    <button className="yt-play-pause" type="button" onClick={togglePlayPause} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</button>
                    <button type="button" onClick={playNext} disabled={!canNext} aria-label="Next video"><SkipForward size={20} fill="currentColor" /></button>
                  </div>
                  <div className="yt-prev-next" aria-label="Video navigation">
                    <button type="button" onClick={playPrev} disabled={!canPrev}><ChevronLeft size={18} /> Previous</button>
                    <button type="button" onClick={playNext} disabled={!canNext}>Next <ChevronRight size={18} /></button>
                  </div>
                  <button className={`yt-pill ${isLiked ? 'active' : ''}`} type="button" onClick={toggleLike}><ThumbsUp size={17} /> {isLiked ? 'Liked' : 'Like'}</button>
                  <button className={`yt-pill ${isSavedLater ? 'active' : ''}`} type="button" onClick={toggleWatchLater}><Bookmark size={17} /> {isSavedLater ? 'Saved' : 'Watch Later'}</button>
                  <button className="yt-pill" type="button" onClick={shareVideo}><Share2 size={17} /> Share</button>
                  {shareNote && <span className="yt-share-note">{shareNote}</span>}
                </div>
                <div className="yt-mini-controls">
                  <button type="button" onClick={togglePlayPause} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
                  <button type="button" onClick={expandPlayer} aria-label="Expand player"><ChevronUp size={18} /></button>
                  <button type="button" onClick={closePlayer} aria-label="Stop and close player"><X size={18} /></button>
                </div>
                <section className="yt-comments" aria-label="Comments">
                  <h2><MessageSquare size={18} /> Comments</h2>
                  {commentsFailed && <p className="yt-empty-note">Comments are turned off for this video or could not be loaded.</p>}
                  {!commentsFailed && comments.length === 0 && <p className="yt-empty-note">No comments yet.</p>}
                  {comments.map((comment) => (
                    <article className="yt-comment" key={comment.id}>
                      {comment.authorImage
                        ? <img src={comment.authorImage} alt="" />
                        : <span className="yt-comment-avatar">{(comment.author || '?').trim().charAt(0).toUpperCase()}</span>}
                      <div>
                        <strong>{comment.author}</strong>
                        <p>{comment.text}</p>
                        <small>👍 {comment.likes}</small>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
              <aside className="yt-upnext">
                <h2>Up next</h2>
                {upNext.length === 0 && <p className="yt-empty-note">No more videos in this list. Search for more.</p>}
                {upNext.map((video) => (
                  <button className="yt-upnext-row" key={video.id} onClick={() => playVideo(video, playerQueue)}>
                    <span className="yt-upnext-thumb">{video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" />}<b>{video.duration}</b></span>
                    <span><strong>{video.title}</strong><small>{video.channel}</small></span>
                  </button>
                ))}
              </aside>
            </section>
          )}
          {playerVideo && minimized && <div className="yt-mini-spacer" />}

          {view === 'home' && (!playerVideo || minimized) && (
            <section aria-label="Videos">
              {loading && queue.length === 0 && <p className="yt-loading"><LoaderCircle size={20} className="spin" /> Loading videos…</p>}
              {!loading && queue.length === 0 && !error && (
                <div className="yt-empty"><Music2 size={30} /><h2>Search for a song</h2><p>Try “Arijit Singh”, “Bhojpuri songs” or anything you like.</p></div>
              )}
              {queue.length > 0 && (
                <div className="yt-section-head"><h2>{homeHead}</h2></div>
              )}
              <div className="yt-grid">{queue.map((video) => videoCard(video, queue))}</div>
              {nextPageToken && <button className="yt-load-more" type="button" onClick={loadMore} disabled={loading}>{loading ? <><LoaderCircle size={16} className="spin" /> Loading more</> : 'Load more videos'}</button>}
            </section>
          )}

          {view === 'trending' && (
            <section aria-label="Trending videos">
              <div className="yt-page-head"><h1><Flame size={22} /> Trending in India</h1></div>
              {loading && queue.length === 0 && <p className="yt-loading"><LoaderCircle size={20} className="spin" /> Loading trending…</p>}
              <div className="yt-grid">{queue.map((video) => videoCard(video, queue))}</div>
            </section>
          )}

          {view === 'channel' && channelView && (
            <section aria-label="Channel videos">
              <div className="yt-channel-head">
                <span className="yt-channel-avatar big">{channelView.name.trim().charAt(0).toUpperCase()}</span>
                <div>
                  <h1>{channelView.name}</h1>
                  <button
                    className={`yt-subscribe ${subscriptions.some((c) => c.id === channelView.id) ? 'subscribed' : ''}`}
                    type="button"
                    onClick={() => toggleSubscribe(channelView)}
                  ><Bell size={16} /> {subscriptions.some((c) => c.id === channelView.id) ? 'Subscribed' : 'Subscribe'}</button>
                </div>
              </div>
              {loading && queue.length === 0 && <p className="yt-loading"><LoaderCircle size={20} className="spin" /> Loading channel videos…</p>}
              <div className="yt-grid">{queue.map((video) => videoCard(video, queue))}</div>
              {nextPageToken && <button className="yt-load-more" type="button" onClick={loadMore} disabled={loading}>{loading ? <><LoaderCircle size={16} className="spin" /> Loading more</> : 'Load more videos'}</button>}
            </section>
          )}

          {view === 'subscriptions' && (
            <section aria-label="Subscriptions">
              <div className="yt-page-head"><h1><Users size={22} /> Subscriptions</h1></div>
              {subscriptions.length === 0 && <div className="yt-empty"><Users size={30} /><h2>No subscriptions yet</h2><p>Tap Subscribe on any channel to see it here.</p></div>}
              <div className="yt-history-list">
                {subscriptions.map((channel) => (
                  <div className="yt-history-row" key={channel.id}>
                    <button className="yt-sub-row" type="button" onClick={() => openChannel(channel)}>
                      <span className="yt-channel-avatar">{channel.name.trim().charAt(0).toUpperCase()}</span>
                      <span><strong>{channel.name}</strong></span>
                    </button>
                    <button className="yt-history-remove" type="button" onClick={() => toggleSubscribe(channel)} aria-label={`Unsubscribe from ${channel.name}`}><X size={17} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {view === 'history' && (
            <section aria-label="Watch history">
              <div className="yt-page-head"><h1><Clock size={22} /> Watch history</h1>{history.length > 0 && <button type="button" onClick={clearHistory}><Trash2 size={16} /> Clear all history</button>}</div>
              {history.length === 0 && <div className="yt-empty"><History size={30} /><h2>No history yet</h2><p>Videos you play will show up here.</p></div>}
              <div className="yt-history-list">
                {history.map((video) => (
                  <div className="yt-history-row" key={video.id}>
                    <button className="yt-history-play" type="button" onClick={() => playVideo(video, history)}>
                      <span className="yt-history-thumb">{video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" />}<b>{video.duration}</b></span>
                      <span><strong>{video.title}</strong><small>{video.channel}</small></span>
                    </button>
                    <button className="yt-history-remove" type="button" onClick={() => removeFromHistory(video.id)} aria-label={`Remove ${video.title} from history`}><X size={17} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {view === 'watchlater' && (
            <section aria-label="Watch Later">
              <div className="yt-page-head"><h1><Clock size={22} /> Watch Later</h1></div>
              {watchLater.length === 0 && <div className="yt-empty"><Bookmark size={30} /><h2>Nothing saved yet</h2><p>Tap Watch Later under a playing video to save it here.</p></div>}
              <div className="yt-grid">{watchLater.map((video) => videoCard(video, watchLater))}</div>
            </section>
          )}

          {view === 'liked' && (
            <section aria-label="Liked videos">
              <div className="yt-page-head"><h1><ThumbsUp size={22} /> Liked videos</h1></div>
              {liked.length === 0 && <div className="yt-empty"><ThumbsUp size={30} /><h2>No liked videos yet</h2><p>Tap Like under a playing video to save it here.</p></div>}
              <div className="yt-grid">{liked.map((video) => videoCard(video, liked))}</div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
