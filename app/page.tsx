'use client'

import { useEffect, useRef, useState } from 'react'
import { Guitar, LoaderCircle, Music2, Pause, Play, Search } from 'lucide-react'

type Result = { id: string; title: string; channel: string; thumbnail: string }

export default function Page() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [selected, setSelected] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [guitarPlaying, setGuitarPlaying] = useState(false)
  const videoRef = useRef<HTMLIFrameElement>(null)
  const guitarTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  async function searchYouTube(event: React.FormEvent) {
    event.preventDefault()
    const value = query.trim()
    if (!value) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(value)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Search failed')
      setResults(data.items.map((item: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
      })))
    } catch (searchError) {
      setResults([])
      setError(searchError instanceof Error ? searchError.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function playResult(result: Result) {
    setSelected(result)
    setPlaying(true)
    setResults([])
  }

  function playGuitarChord() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = audioContextRef.current ?? new AudioContextClass()
    audioContextRef.current = context
    if (context.state === 'suspended') void context.resume()

    const now = context.currentTime
    const master = context.createGain()
    const tone = context.createBiquadFilter()
    const body = context.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.setValueAtTime(4200, now)
    tone.Q.value = 0.45
    body.type = 'peaking'
    body.frequency.value = 180
    body.Q.value = 0.8
    body.gain.value = 3
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.32, now + 0.025)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.1)
    tone.connect(body).connect(master).connect(context.destination)

    const notes = [110, 146.83, 196, 246.94, 293.66, 369.99]
    notes.forEach((frequency, index) => {
      const start = now + index * 0.045
      const oscillator = context.createOscillator()
      const harmonic = context.createOscillator()
      const pluck = context.createGain()
      oscillator.type = 'sawtooth'
      harmonic.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency * 1.012, start)
      oscillator.detune.setValueAtTime(-5, start)
      harmonic.frequency.value = frequency * 2
      pluck.gain.setValueAtTime(0.0001, start)
      pluck.gain.exponentialRampToValueAtTime(0.18 / (index + 1), start + 0.008)
      pluck.gain.exponentialRampToValueAtTime(0.0001, start + 1.65)
      oscillator.connect(pluck)
      harmonic.connect(pluck)
      pluck.connect(tone)
      oscillator.start(start)
      harmonic.start(start)
      oscillator.stop(start + 1.8)
      harmonic.stop(start + 1.8)
    })
  }

  function toggleGuitar() {
    if (guitarPlaying) {
      if (guitarTimerRef.current) clearInterval(guitarTimerRef.current)
      guitarTimerRef.current = null
      setGuitarPlaying(false)
      return
    }
    playGuitarChord()
    guitarTimerRef.current = setInterval(playGuitarChord, 2200)
    setGuitarPlaying(true)
  }

  function togglePlayback() {
    const next = !playing
    setPlaying(next)
    videoRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: next ? 'playVideo' : 'pauseVideo', args: [] }), '*')
  }

  useEffect(() => () => {
    if (guitarTimerRef.current) clearInterval(guitarTimerRef.current)
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
        <form className="youtube-search" onSubmit={searchYouTube}>
          <Search size={20} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any song on YouTube" aria-label="Search any song on YouTube" />
          <button type="submit" disabled={loading || !query.trim()}>{loading ? <LoaderCircle size={18} className="spin" /> : 'Search'}</button>
        </form>
        {error && <p className="youtube-error" role="alert">{error}</p>}
      </section>

      {results.length > 0 && <section className="youtube-results" aria-label="YouTube search results">
        <div className="results-heading"><span>SEARCH RESULTS</span><strong>{results.length} videos</strong></div>
        <div className="results-grid">{results.map((result) => <button className="youtube-result" key={result.id} onClick={() => playResult(result)}>
          <span className="result-thumbnail">{result.thumbnail && <img src={result.thumbnail} alt="" />}<i><Play size={15} fill="currentColor" /></i></span>
          <span><strong>{result.title}</strong><small>{result.channel}</small></span>
        </button>)}</div>
      </section>}

      <section className={`youtube-display ${selected ? 'has-video' : ''}`}>
        {selected ? <>
          <div className="display-title"><div><span>NOW PLAYING</span><h2>{selected.title}</h2><p>{selected.channel}</p></div><div className="display-actions"><button className={`guitar-play ${guitarPlaying ? 'is-playing' : ''}`} onClick={toggleGuitar} aria-pressed={guitarPlaying}><Guitar size={17} />{guitarPlaying ? 'Stop guitar' : 'Play guitar'}</button><button className="display-play" onClick={togglePlayback} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button></div></div>
          <div className="youtube-video"><iframe ref={videoRef} src={`https://www.youtube.com/embed/${selected.id}?enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}&rel=0`} title={selected.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>
        </> : <div className="empty-display"><div className="empty-icon"><Music2 size={28} /></div><h2>Your next song lives here</h2><p>Search above to start listening</p></div>}
      </section>
      <footer className="youtube-footer">Powered by YouTube <span>•</span> Made for practice</footer>
    </main>
  )
}
