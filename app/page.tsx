'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, Mic, Music2, Play, Search, X } from 'lucide-react'

type Result = { id: string; title: string; channel: string; thumbnail: string; duration: string }

export default function Page() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [selected, setSelected] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)
  const recognitionRef = useRef<{ start: () => void; stop: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null; onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null } | null>(null)
  const videoRef = useRef<HTMLIFrameElement>(null)
  const displayRef = useRef<HTMLElement>(null)
  const resultsRef = useRef<Result[]>([])
  const selectedRef = useRef<Result | null>(null)
  const historyRef = useRef<Result[]>([])

  async function toggleVoiceSearch() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

      type BrowserSpeechRecognition = NonNullable<typeof recognitionRef.current> & {
      abort?: () => void
      onstart?: (() => void) | null
      onnomatch?: (() => void) | null
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => BrowserSpeechRecognition
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition
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

    // Stop an old session before creating a new one. This avoids the
    // "recognition has already started" error after a cancelled search.
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
      void searchYouTube({ preventDefault: () => undefined } as React.FormEvent, transcript)
    }
    recognition.onstart = () => {
      setListening(true)
      setError('')
    }
    recognition.onnomatch = () => {
      setListening(false)
      setError('I could not understand that. Please try again.')
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognition.onerror = (event) => {
      setListening(false)
      recognitionRef.current = null
      const code = event.error
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Microphone access is blocked. Allow microphone access for this deployed site, then try again.')
      } else if (code === 'audio-capture') {
        setError('No microphone was detected. Connect a microphone and try again.')
      } else if (code === 'no-speech') {
        setError('No speech detected. Tap the microphone and speak clearly.')
      } else {
        setError('Voice search could not start. Try the microphone again.')
      }
    }
    recognitionRef.current = recognition
    setError('')
    try {
      // start() must run directly in the microphone button's click handler.
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
    setResults([])
    resultsRef.current = []
    setNextPageToken(null)
    setSelected(null)
    selectedRef.current = null
    historyRef.current = []
    setPlaying(false)
    setError('')
  }

  async function searchYouTube(event: React.FormEvent, submittedQuery = query) {
    event.preventDefault()
    const value = submittedQuery.trim()
    if (!value) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(value)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Search failed')
      const videos = data.items.map((item: { id: { videoId: string }; duration?: string; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
        duration: item.duration ?? '—',
      }))
      setResults(videos)
      resultsRef.current = videos
      setNextPageToken(data.nextPageToken ?? null)
    } catch (searchError) {
      setResults([])
      setError(searchError instanceof Error ? searchError.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function refreshVideos() {
    if (!nextPageToken || loading || !query.trim()) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query.trim())}&pageToken=${encodeURIComponent(nextPageToken)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not load more videos')
      const videos: Result[] = data.items.map((item: { id: { videoId: string }; duration?: string; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
        duration: item.duration ?? '—',
      }))
      setResults((current) => {
        const updated = [...current, ...videos]
        resultsRef.current = updated
        return updated
      })
      setNextPageToken(data.nextPageToken ?? null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not load more videos')
    } finally {
      setLoading(false)
    }
  }

  function playResult(result: Result, addToHistory = true) {
    const current = selectedRef.current
    if (addToHistory && current && current.id !== result.id) historyRef.current.push(current)
    selectedRef.current = result
    setSelected(result)
    setPlaying(true)
    setResults((currentResults) => {
      const updated = currentResults.filter((video) => video.id !== result.id)
      resultsRef.current = updated
      return updated
    })
  }

  function playNextVideo() {
    const nextVideo = resultsRef.current[0]
    if (nextVideo) playResult(nextVideo)
  }

  function playPreviousVideo() {
    const previousVideo = historyRef.current.pop()
    if (!previousVideo) return
    const current = selectedRef.current
    if (current) {
      setResults((currentResults) => {
        const updated = [current, ...currentResults.filter((video) => video.id !== current.id)]
        resultsRef.current = updated
        return updated
      })
    }
    playResult(previousVideo, false)
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

  useEffect(() => {
    if (!selected) return
    displayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: selected.title,
        artist: selected.channel,
        album: 'GuitarPlay',
      })
      navigator.mediaSession.setActionHandler('nexttrack', playNextVideo)
      navigator.mediaSession.setActionHandler('previoustrack', playPreviousVideo)
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
  }, [selected, playing])

  useEffect(() => {
    const handleYouTubeMessage = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com')) return
      let message: { event?: string; info?: number }
      try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data } catch { return }
      if (message.event !== 'onStateChange' || message.info !== 0) return
      const nextVideo = resultsRef.current[0]
      if (nextVideo && nextVideo.id !== selectedRef.current?.id) playResult(nextVideo)
      else setPlaying(false)
    }
    window.addEventListener('message', handleYouTubeMessage)
    return () => window.removeEventListener('message', handleYouTubeMessage)
  }, [])

  return (
    <main className="youtube-app">
      <div className="youtube-glow youtube-glow-one" />
      <div className="youtube-glow youtube-glow-two" />
      <header className="youtube-header">
        <div className="youtube-brand"><span><Music2 size={18} /></span><strong>guitar<span>play</span></strong></div>
        <p>Search. Play. Practice.</p>
      </header>

      <section className="youtube-hero">
        <p className="youtube-kicker">YOUR MUSIC, IN ONE PLACE</p>
        <h1>Find a song.<br /><em>Press play.</em></h1>
        <p className="youtube-intro">Search YouTube for any song and play it right here.</p>
        <div className="dashboard-controls">
          <form className="youtube-search" onSubmit={searchYouTube}>
            <Search size={20} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any song on YouTube" aria-label="Search any song on YouTube" />
            {query.trim() && <button className="search-action search-clear" type="button" onClick={clearSearch} aria-label="Clear search" title="Clear search"><X size={18} /></button>}
            <button className={`search-action search-voice ${listening ? 'is-listening' : ''}`} type="button" onClick={toggleVoiceSearch} aria-label={listening ? 'Stop voice search' : voiceSupported ? 'Search by voice' : 'Voice search is unavailable in this browser'} aria-pressed={listening} title={listening ? 'Stop voice search' : voiceSupported ? 'Search by voice' : 'Voice search works in Chrome, Edge, and Safari'}><Mic size={18} /></button>
            <button className="search-submit" type="submit" disabled={loading || !query.trim()}>{loading ? <LoaderCircle size={18} className="spin" /> : 'Search'}</button>
          </form>
        </div>
        {error && <p className="youtube-error" role="alert">{error}</p>}
      </section>

      {results.length > 0 && <section className="youtube-results" aria-label="YouTube search results">
        <div className="results-heading"><span>SEARCH RESULTS</span><strong>{results.length} videos</strong></div>
        <div className="results-grid">{results.map((result) => <button className="youtube-result" key={result.id} onClick={() => playResult(result)}>
          <span className="result-thumbnail">{result.thumbnail && <img src={result.thumbnail} alt="" />}<i><Play size={15} fill="currentColor" /></i><b className="result-duration">{result.duration}</b></span>
          <span><strong>{result.title}</strong><small>{result.channel}</small></span>
        </button>)}</div>
        {nextPageToken && <button className="load-more-button" type="button" onClick={refreshVideos} disabled={loading}>{loading ? <><LoaderCircle size={16} className="spin" /> Loading more</> : 'Refresh for more videos'}</button>}
      </section>}

      <section ref={displayRef} className={`youtube-display ${selected ? 'has-video' : ''}`}>
        {selected ? <>
          <div className="display-title"><div><span>NOW PLAYING</span><h2>{selected.title}</h2><p>{selected.channel}</p></div></div>
          <div className="youtube-video"><iframe ref={videoRef} onLoad={startVideoPlayback} src={`https://www.youtube.com/embed/${selected.id}?enablejsapi=1&autoplay=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}&rel=0`} title={selected.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>
          <nav className="video-navigation" aria-label="Video navigation"><button type="button" onClick={playPreviousVideo} disabled={historyRef.current.length === 0} aria-label="Previous video"><ChevronLeft size={18} /> Previous</button><button type="button" onClick={playNextVideo} disabled={results.length === 0} aria-label="Next video">Next <ChevronRight size={18} /></button></nav>
        </> : <div className="empty-display"><div className="empty-icon"><Music2 size={28} /></div><h2>Your next song lives here</h2><p>Search above to start listening</p></div>}
      </section>


      <footer className="youtube-footer">Powered by YouTube <span>•</span> Made for practice</footer>
    </main>
  )
}
