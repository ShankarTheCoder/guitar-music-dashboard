'use client'

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Music2, Pause, Play, Search, Truck } from 'lucide-react'

type Result = { id: string; title: string; channel: string; thumbnail: string }

export default function Page() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [selected, setSelected] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [truckPlaying, setTruckPlaying] = useState(false)
  const videoRef = useRef<HTMLIFrameElement>(null)
  const truckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
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

  function playTruckSound() {
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

    const horn = context.createOscillator()
    const hornHarmonic = context.createOscillator()
    const engine = context.createOscillator()
    const hornGain = context.createGain()
    const engineGain = context.createGain()
    horn.type = 'sawtooth'
    hornHarmonic.type = 'square'
    engine.type = 'sawtooth'
    horn.frequency.setValueAtTime(330, now)
    horn.frequency.exponentialRampToValueAtTime(245, now + 0.7)
    hornHarmonic.frequency.setValueAtTime(165, now)
    engine.frequency.setValueAtTime(58, now)
    engine.frequency.linearRampToValueAtTime(72, now + 1.8)
    hornGain.gain.setValueAtTime(0.0001, now)
    hornGain.gain.exponentialRampToValueAtTime(0.16, now + 0.04)
    hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)
    engineGain.gain.setValueAtTime(0.0001, now)
    engineGain.gain.exponentialRampToValueAtTime(0.22, now + 0.12)
    engineGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.05)
    horn.connect(hornGain)
    hornHarmonic.connect(hornGain)
    engine.connect(engineGain)
    hornGain.connect(tone)
    engineGain.connect(body)
    horn.start(now)
    hornHarmonic.start(now)
    engine.start(now)
    horn.stop(now + 1.5)
    hornHarmonic.stop(now + 1.5)
    engine.stop(now + 2.1)
  }

  function toggleTruck() {
    if (truckPlaying) {
      if (truckTimerRef.current) clearInterval(truckTimerRef.current)
      truckTimerRef.current = null
      setTruckPlaying(false)
      return
    }
    playTruckSound()
    truckTimerRef.current = setInterval(playTruckSound, 2200)
    setTruckPlaying(true)
  }

  function togglePlayback() {
    const next = !playing
    setPlaying(next)
    videoRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: next ? 'playVideo' : 'pauseVideo', args: [] }), '*')
  }

  useEffect(() => () => {
    if (truckTimerRef.current) clearInterval(truckTimerRef.current)
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
          <div className="display-title"><div><span>NOW PLAYING</span><h2>{selected.title}</h2><p>{selected.channel}</p></div><div className="display-actions"><button className={`guitar-play ${truckPlaying ? 'is-playing' : ''}`} onClick={toggleTruck} aria-pressed={truckPlaying}><Truck size={17} />{truckPlaying ? 'Stop truck' : 'Truck sound'}</button><button className="display-play" onClick={togglePlayback} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button></div></div>
          <div className="youtube-video"><iframe ref={videoRef} src={`https://www.youtube.com/embed/${selected.id}?enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}&rel=0`} title={selected.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>
        </> : <div className="empty-display"><div className="empty-icon"><Music2 size={28} /></div><h2>Your next song lives here</h2><p>Search above to start listening</p></div>}
      </section>
      <footer className="youtube-footer">Powered by YouTube <span>•</span> Made for practice</footer>
    </main>
  )
}
