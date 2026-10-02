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
  const truckNodesRef = useRef<{ source: AudioScheduledSourceNode; gain: GainNode }[]>([])
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
      const videos = data.items.map((item: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
      }))
      setResults(videos)
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
      setResults((current) => current.filter((video) => video.id !== result.id))
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
    const rumble = context.createBiquadFilter()
    rumble.type = 'lowpass'
    rumble.frequency.value = 520
    master.gain.value = 0.16
    rumble.connect(master).connect(context.destination)

    const engine = context.createOscillator()
    const engineGain = context.createGain()
    engine.type = 'sawtooth'
    engine.frequency.setValueAtTime(46, now)
    engine.frequency.linearRampToValueAtTime(61, now + 2.5)
    engineGain.gain.value = 0.7
    engine.connect(engineGain).connect(rumble)

    const diesel = context.createOscillator()
    const dieselGain = context.createGain()
    diesel.type = 'square'
    diesel.frequency.setValueAtTime(92, now)
    diesel.frequency.linearRampToValueAtTime(122, now + 2.5)
    dieselGain.gain.value = 0.12
    diesel.connect(dieselGain).connect(rumble)

    engine.start(now)
    diesel.start(now)
    truckNodesRef.current = [{ source: engine, gain: master }, { source: diesel, gain: master }]
    setTruckPlaying(true)
  }

  function togglePlayback() {
    const next = !playing
    setPlaying(next)
    videoRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: next ? 'playVideo' : 'pauseVideo', args: [] }), '*')
  }

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
