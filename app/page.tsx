'use client'

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Music2, Pause, Play, Search, Truck, X } from 'lucide-react'

type Result = { id: string; title: string; channel: string; thumbnail: string; videoType: 'Short' | 'Long video' | 'Video' }

export default function Page() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [selected, setSelected] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [truckPlaying, setTruckPlaying] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<{ start: () => void; stop: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null; onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null } | null>(null)
  const videoRef = useRef<HTMLIFrameElement>(null)
  const resultsRef = useRef<Result[]>([])
  const selectedRef = useRef<Result | null>(null)
  const truckNodesRef = useRef<{ source: AudioScheduledSourceNode; gain: GainNode }[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)

  async function toggleVoiceSearch() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const speechWindow = window as typeof window & { SpeechRecognition?: new () => NonNullable<typeof recognitionRef.current>; webkitSpeechRecognition?: new () => NonNullable<typeof recognitionRef.current> }
    const SpeechRecognitionClass = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setError('Voice search is not supported in this browser. Try Chrome or Edge.')
      return
    }

    // Start recognition directly from the click. Awaiting getUserMedia first can
    // consume the browser's user gesture and make SpeechRecognition reject start().
    const recognition = new SpeechRecognitionClass()
    recognition.lang = navigator.language || 'en-US'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? ''
      if (!transcript) {
        setListening(false)
        setError('I could not understand that. Please try again.')
        return
      }
      setQuery(transcript)
      setListening(false)
      void searchYouTube({ preventDefault: () => undefined } as React.FormEvent, transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = (event) => {
      setListening(false)
      const code = event.error
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Microphone access is blocked in this preview. Allow microphone access for this site, then try again.')
      } else if (code === 'audio-capture') {
        setError('No microphone was detected. Connect a microphone and try again.')
      } else if (code === 'no-speech') {
        setError('No speech detected. Tap the voice button and speak clearly.')
      } else {
        setError('Voice search could not start. Try the voice button again.')
      }
    }
    recognitionRef.current = recognition
    setError('')
    setListening(true)
    try {
      recognition.start()
    } catch {
      setListening(false)
      setError('Voice search could not start. Tap the microphone button again.')
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
      const videos = data.items.map((item: { id: { videoId: string }; videoType?: Result['videoType']; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
        videoType: item.videoType ?? 'Video',
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
      const videos: Result[] = data.items.map((item: { id: { videoId: string }; videoType?: Result['videoType']; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
        videoType: item.videoType ?? 'Long video',
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

  function playResult(result: Result) {
    selectedRef.current = result
    setSelected(result)
    setPlaying(true)
    setResults((current) => {
      const updated = current.filter((video) => video.id !== result.id)
      resultsRef.current = updated
      return updated
    })
  }

  function toggleTruck() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = audioContextRef.current ?? new AudioContextClass()
    audioContextRef.current = context

    if (truckPlaying) {
      const now = context.currentTime
      truckNodesRef.current.forEach(({ gain }) => {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setTargetAtTime(0.0001, now, 0.08)
      })
      truckNodesRef.current.forEach(({ source }) => {
        try { source.stop(now + 0.35) } catch { /* already stopped */ }
      })
      truckNodesRef.current = []
      setTruckPlaying(false)
      return
    }

    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime
    const master = context.createGain()
    master.gain.value = 0.2
    master.connect(context.destination)

    const siren = context.createOscillator()
    const sirenGain = context.createGain()
    siren.type = 'sawtooth'
    sirenGain.gain.value = 0.0001
    sirenGain.gain.setTargetAtTime(0.68, now, 0.04)
    siren.connect(sirenGain).connect(master)

    // A repeating two-tone sweep gives the button a continuous fire-truck siren sound.
    const cycle = 1.35
    for (let offset = 0; offset < 120; offset += cycle) {
      const start = now + offset
      siren.frequency.setValueAtTime(660, start)
      siren.frequency.linearRampToValueAtTime(980, start + cycle * 0.48)
      siren.frequency.linearRampToValueAtTime(660, start + cycle)
    }

    siren.start(now)
    truckNodesRef.current = [{ source: siren, gain: master }]
    setTruckPlaying(true)
  }

  function togglePlayback() {
    const next = !playing
    setPlaying(next)
    videoRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: next ? 'playVideo' : 'pauseVideo', args: [] }), '*')
  }

  function startVideoPlayback() {
    if (!playing) setPlaying(true)
    const player = videoRef.current?.contentWindow
    player?.postMessage(JSON.stringify({ event: 'listening', id: '1', channel: 'channel' }), '*')
    player?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }), '*')
    player?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
  }

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

  useEffect(() => () => {
    truckNodesRef.current.forEach(({ source }) => {
      try { source.stop() } catch { /* already stopped */ }
    })
    void audioContextRef.current?.close()
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
            <button className={`search-action search-voice ${listening ? 'is-listening' : ''}`} type="button" onClick={toggleVoiceSearch} aria-label={listening ? 'Stop voice search' : 'Search by voice'} aria-pressed={listening} title={listening ? 'Stop voice search' : 'Search by voice'}><Mic size={18} /></button>
            <button className="search-submit" type="submit" disabled={loading || !query.trim()}>{loading ? <LoaderCircle size={18} className="spin" /> : 'Search'}</button>
          </form>
          <button className={`guitar-play dashboard-truck ${truckPlaying ? 'is-playing' : ''}`} onClick={toggleTruck} aria-pressed={truckPlaying}>
            <Truck size={17} />{truckPlaying ? 'Stop truck' : 'Truck sound'}
          </button>
        </div>
        {error && <p className="youtube-error" role="alert">{error}</p>}
      </section>

      {results.length > 0 && <section className="youtube-results" aria-label="YouTube search results">
        <div className="results-heading"><span>SEARCH RESULTS</span><strong>{results.length} videos</strong></div>
        <div className="results-grid">{results.map((result) => <button className="youtube-result" key={result.id} onClick={() => playResult(result)}>
          <span className="result-thumbnail">{result.thumbnail && <img src={result.thumbnail} alt="" />}<i><Play size={15} fill="currentColor" /></i><b className="result-type">{result.videoType}</b></span>
          <span><strong>{result.title}</strong><small>{result.channel}</small></span>
        </button>)}</div>
        {nextPageToken && <button className="load-more-button" type="button" onClick={refreshVideos} disabled={loading}>{loading ? <><LoaderCircle size={16} className="spin" /> Loading more</> : 'Refresh for more videos'}</button>}
      </section>}

      <section className={`youtube-display ${selected ? 'has-video' : ''}`}>
        {selected ? <>
          <div className="display-title"><div><span>NOW PLAYING</span><h2>{selected.title}</h2><p>{selected.channel}</p></div><div className="display-actions"><button className="display-play" onClick={togglePlayback} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button></div></div>
          <div className="youtube-video"><iframe ref={videoRef} onLoad={startVideoPlayback} src={`https://www.youtube.com/embed/${selected.id}?enablejsapi=1&autoplay=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}&rel=0`} title={selected.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>
        </> : <div className="empty-display"><div className="empty-icon"><Music2 size={28} /></div><h2>Your next song lives here</h2><p>Search above to start listening</p></div>}
      </section>


      <footer className="youtube-footer">Powered by YouTube <span>•</span> Made for practice</footer>
    </main>
  )
}
