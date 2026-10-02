'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Disc3,
  Gauge,
  Headphones,
  Heart,
  Home,
  ListMusic,
  Maximize2,
  Menu,
  Mic2,
  Minus,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Volume2,
  Waves,
  X,
  Zap,
} from 'lucide-react'

const songs = [
  { title: 'Slow Dancing in a Burning Room', artist: 'John Mayer', time: '4:02', tone: 'indigo', video: 'https://www.youtube.com/embed/2Vv-BfVoq4g' },
  { title: 'Nothing Else Matters', artist: 'Metallica', time: '6:28', tone: 'amber', video: 'https://www.youtube.com/embed/tAGnKpE4NCI' },
  { title: 'Blackbird', artist: 'The Beatles', time: '2:18', tone: 'rose', video: 'https://www.youtube.com/embed/Man4Xw8Xypo' },
]
const chords = ['C', 'D', 'Dm', 'E', 'Em', 'F', 'G', 'A', 'Am', 'B', 'Bm']
const strings = [
  { name: 'E', octave: 2 }, { name: 'A', octave: 2 }, { name: 'D', octave: 3 },
  { name: 'G', octave: 3 }, { name: 'B', octave: 3 }, { name: 'e', octave: 4 },
]
const fretNotes = ['E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E']

function IconButton({ children, label, active = false, onClick }: { children: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return <button className={`icon-button ${active ? 'is-active' : ''}`} aria-label={label} title={label} onClick={onClick}>{children}</button>
}

export default function Page() {
  const [selectedSong, setSelectedSong] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [favorite, setFavorite] = useState(true)
  const [speed, setSpeed] = useState('1x')
  const [volume, setVolume] = useState(72)
  const [search, setSearch] = useState('')
  const [metronome, setMetronome] = useState(false)
  const [youtubeSearch, setYoutubeSearch] = useState('')
  const [youtubeResults, setYoutubeResults] = useState<{ id: string; title: string; channel: string; thumbnail: string }[]>([])
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeError, setYoutubeError] = useState('')
  const [customSong, setCustomSong] = useState<{ title: string; artist: string; time: string; tone: string; video: string } | null>(null)
  const [bpm, setBpm] = useState(90)
  const [activeString, setActiveString] = useState(5)
  const [activeFret, setActiveFret] = useState(0)
  const [tone, setTone] = useState('Clean Electric')
  const [practiceSeconds, setPracticeSeconds] = useState(132)
  const audioRef = useRef<AudioContext | null>(null)
  const videoRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setPracticeSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const currentSong = customSong ?? songs[selectedSong]
  const formattedPracticeTime = `${Math.floor(practiceSeconds / 60).toString().padStart(2, '0')}:${(practiceSeconds % 60).toString().padStart(2, '0')}`
  const filteredSongs = useMemo(() => songs.filter((song) => `${song.title} ${song.artist}`.toLowerCase().includes(search.toLowerCase())), [search])

  function playNote(stringIndex: number, fret: number) {
    setActiveString(stringIndex)
    setActiveFret(fret)
    try {
      const context = audioRef.current ?? new AudioContext()
      audioRef.current = context
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const base = [82.41, 110, 146.83, 196, 246.94, 329.63][stringIndex]
      oscillator.frequency.value = base * Math.pow(2, fret / 12)
      oscillator.type = tone === 'Overdrive' ? 'sawtooth' : tone === 'Acoustic' ? 'triangle' : 'sine'
      gain.gain.setValueAtTime(0.0001, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.1)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + 1.12)
    } catch { /* Audio is optional when the browser blocks initialization. */ }
  }

  async function searchYouTube(event: React.FormEvent) {
    event.preventDefault()
    const query = youtubeSearch.trim()
    if (!query) return
    setYoutubeLoading(true)
    setYoutubeError('')
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'YouTube search failed.')
      setYoutubeResults(data.items.map((item: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }) => ({ id: item.id.videoId, title: item.snippet.title, channel: item.snippet.channelTitle, thumbnail: item.snippet.thumbnails?.medium?.url ?? '' })))
    } catch (error) {
      setYoutubeError(error instanceof Error ? error.message : 'YouTube search failed.')
      setYoutubeResults([])
    } finally {
      setYoutubeLoading(false)
    }
  }

  function controlYouTube(command: 'playVideo' | 'pauseVideo') {
    videoRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*')
  }

  function togglePlayback() {
    const nextPlaying = !playing
    setPlaying(nextPlaying)
    controlYouTube(nextPlaying ? 'playVideo' : 'pauseVideo')
  }

  function playYouTubeResult(result: { id: string; title: string; channel: string }) {
    setCustomSong({ title: result.title, artist: result.channel, time: 'YouTube', tone: 'indigo', video: `https://www.youtube.com/embed/${result.id}` })
    setPlaying(true)
  }

  function toggleMetronome() {
    setMetronome((value) => !value)
    if (!metronome) playNote(0, 0)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Music2 size={17} /></span><span>guitar<span className="brand-accent">play</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className="nav-item active"><Home size={18} /> <span>Overview</span><span className="nav-dot" /></button>
          <button className="nav-item"><ListMusic size={18} /> <span>My Practice</span></button>
          <button className="nav-item"><Headphones size={18} /> <span>Discover</span></button>
          <button className="nav-item"><Mic2 size={18} /> <span>Guitar Lab</span></button>
        </nav>
        <div className="workspace-label library-label">YOUR LIBRARY</div>
        <nav className="primary-nav">
          <button className="nav-item"><Heart size={18} /> <span>Favorites</span></button>
          <button className="nav-item"><Clock3 size={18} /> <span>History</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="upgrade-card"><Sparkles size={17} /><strong>Unlock your flow</strong><span>Track every session with Pro.</span><button>Explore Pro <ChevronRight size={13} /></button></div><button className="nav-item"><Settings2 size={18} /> <span>Settings</span></button><div className="profile"><div className="avatar">JD</div><div><strong>Jamie Davis</strong><span>Free plan</span></div><MoreHorizontal size={18} /></div></div>
      </aside>

      <section className="content-area">
        <header className="topbar"><button className="mobile-menu" aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb"><span>Overview</span><ChevronRight size={14} /><strong>Good afternoon, Jamie</strong></div><div className="top-actions"><button className="help-button"><CircleHelp size={17} /> Help center</button><IconButton label="Notifications"><Activity size={18} /></IconButton><div className="mini-avatar">JD</div></div></header>

        <div className="content-scroll">
          <section className="welcome-row"><div><p className="eyebrow">THURSDAY, OCTOBER 2, 2026</p><h1>Make today <em>resonate.</em></h1><p className="subheading">Your session is ready when you are. Let&apos;s make some music.</p></div><div className="streak-card"><div className="streak-icon"><Zap size={18} fill="currentColor" /></div><div><span>Current streak</span><strong>7 days</strong></div><div className="streak-bars"><i /><i /><i /><i /><i /><i /><i className="today" /></div></div></section>

          <section className="dashboard-grid">
            <div className="main-column">
              <section className="panel player-panel"><div className="panel-heading"><div><span className="section-kicker"><span className="live-dot" /> NOW PLAYING</span><h2>{currentSong.title}</h2><p>{currentSong.artist} <span className="muted-separator">•</span> Official Audio</p></div><button className="more-button" aria-label="More options"><MoreHorizontal size={20} /></button></div><div className="video-frame"><iframe ref={videoRef} key={currentSong.video} src={`${currentSong.video}?enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}&rel=0&modestbranding=1`} title={`${currentSong.title} YouTube player`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /><div className="video-overlay"><div className="video-brand"><span><Music2 size={13} /></span> guitarplay session</div></div></div><div className="player-controls"><IconButton label="Previous"><ChevronLeft size={19} /></IconButton><button className="play-button" onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><IconButton label="Next"><ChevronRight size={19} /></IconButton><div className="seek-group"><div className="seek-track"><span style={{ width: '24%' }} /></div><div className="time-row"><span>1:08</span><span>4:02</span></div></div><div className="volume-group"><Volume2 size={17} /><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></div><IconButton label="Fullscreen"><Maximize2 size={17} /></IconButton></div><div className="song-actions"><button className="secondary-button"><ListMusic size={15} /> Add to practice</button><button className={`favorite-button ${favorite ? 'selected' : ''}`} onClick={() => setFavorite(!favorite)}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? 'Saved' : 'Favorite'}</button><div className="speed-selector"><Gauge size={15} /><span>Speed</span><select aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(event.target.value)}>{['0.5x', '0.75x', '1x', '1.25x', '1.5x'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></div></div></section>

              <section className="panel practice-panel"><div className="panel-heading compact"><div><span className="section-kicker">PRACTICE CONTROLS</span><h2>Stay in the pocket</h2></div><span className="session-pill"><span /> Session {formattedPracticeTime}</span></div><div className="practice-controls"><div className="control-card loop-card"><div className="control-icon purple"><Repeat2 size={18} /></div><div><strong>Loop section</strong><span>A — B loop is off</span></div><button className="toggle" aria-label="Toggle loop"><span /></button></div><div className="control-card"><div className="control-icon orange"><Timer size={18} /></div><div><strong>Metronome</strong><span>{metronome ? `${bpm} BPM · 4/4` : 'Keep your time'}</span></div><button className={`toggle ${metronome ? 'on' : ''}`} onClick={toggleMetronome} aria-label="Toggle metronome"><span /></button></div><div className="tempo-control"><div><span className="small-label">TEMPO</span><strong>{bpm} <small>BPM</small></strong></div><div className="stepper"><button aria-label="Decrease BPM" onClick={() => setBpm(Math.max(40, bpm - 1))}><Minus size={14} /></button><button aria-label="Increase BPM" onClick={() => setBpm(Math.min(220, bpm + 1))}><Plus size={14} /></button></div></div></div></section>

              <section className="panel fretboard-panel"><div className="panel-heading compact"><div><span className="section-kicker">GUITAR LAB</span><h2>Play along</h2></div><div className="instrument-selector"><Waves size={15} /><select value={tone} onChange={(event) => setTone(event.target.value)} aria-label="Guitar sound">{['Acoustic', 'Clean Electric', 'Overdrive', 'Bass'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></div></div><div className="fretboard-wrap"><div className="fret-labels"><span /><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span><span>11</span><span>12</span></div><div className="fretboard"><div className="nut" />{strings.map((string, stringIndex) => <div className="string-row" key={string.name}><span className="string-name">{string.name}</span><div className="string-line" style={{ height: `${1 + stringIndex * 0.35}px` }} />{Array.from({ length: 13 }).map((_, fret) => <button key={fret} className={`fret-cell ${activeString === stringIndex && activeFret === fret ? 'selected' : ''}`} onClick={() => playNote(stringIndex, fret)} aria-label={`${string.name} string, fret ${fret}`}>{activeString === stringIndex && activeFret === fret ? <span className="note-label">{fretNotes[(fret + stringIndex * 2) % fretNotes.length]}</span> : null}</button>)}</div>)}</div><div className="fretboard-footer"><span className="hint-text">Click a fret to play</span><span className="detected-note">Last note <strong>{fretNotes[(activeFret + activeString * 2) % fretNotes.length]}{strings[activeString].octave + Math.floor(activeFret / 12)}</strong></span></div></div></section>
            </div>

            <aside className="right-column"><section className="panel search-panel"><div className="panel-heading compact"><div><span className="section-kicker">DISCOVER</span><h2>Find your next song</h2></div><button className="filter-button" aria-label="Filter search"><SlidersHorizontal size={17} /></button></div><form className="search-input" onSubmit={searchYouTube}><Search size={17} /><input value={youtubeSearch} onChange={(event) => setYoutubeSearch(event.target.value)} placeholder="Search any song on YouTube" aria-label="Search any song on YouTube" /><button className="youtube-search-button" type="submit" disabled={youtubeLoading || !youtubeSearch.trim()}>{youtubeLoading ? 'Searching…' : 'Search'}</button></form>{youtubeError && <p className="search-error" role="alert">{youtubeError}</p>}<div className="result-list">{youtubeResults.length > 0 ? youtubeResults.map((result) => <button className="result-item" key={result.id} onClick={() => playYouTubeResult(result)}><span className="result-art indigo">{result.thumbnail ? <img src={result.thumbnail} alt="" /> : <Disc3 size={20} />}<Play size={14} fill="currentColor" /></span><span className="result-copy"><strong>{result.title}</strong><small>{result.channel}</small></span><span className="result-time">YouTube</span></button>) : filteredSongs.map((song, index) => <button className={`result-item ${index === selectedSong ? 'selected' : ''}`} key={song.title} onClick={() => { setSelectedSong(index); setCustomSong(null) }}><span className={`result-art ${song.tone}`}><Disc3 size={20} /><span>{index + 1}</span></span><span className="result-copy"><strong>{song.title}</strong><small>{song.artist}</small></span><span className="result-time">{song.time}</span><Play size={14} className="result-play" fill="currentColor" /></button>)}</div><button className="browse-button" type="button">Search YouTube to find more songs <ChevronRight size={15} /></button></section>
              <section className="panel chord-panel"><div className="panel-heading compact"><div><span className="section-kicker">CHORD PROGRESSION</span><h2>Blackbird <span className="muted-separator">•</span> Verse</h2></div><button className="more-button" aria-label="Chord options"><MoreHorizontal size={19} /></button></div><div className="current-chord"><div><span>PLAYING NOW</span><strong>G</strong></div><div className="chord-diagram"><div className="diagram-frets">{[0, 1, 2, 3, 4].map((fret) => <div className="diagram-row" key={fret}>{[0, 1, 2, 3, 4, 5].map((string) => <i key={string} className={fret === 1 && [1, 2, 4].includes(string) ? 'finger' : ''} />)}</div>)}</div><div className="diagram-names"><span>E</span><span>A</span><span>D</span><span>G</span><span>B</span><span>e</span></div></div></div><div className="chord-list">{chords.slice(0, 5).map((chord, index) => <button className={index === 0 ? 'active' : ''} key={chord}><span>{chord}</span>{index < 4 ? <ChevronRight size={14} /> : null}</button>)}</div></section>
              <section className="panel mic-panel"><div className="mic-copy"><div className="mic-icon"><Mic2 size={19} /></div><div><span className="section-kicker">REAL-TIME MODE</span><h2>Play real guitar</h2><p>Use your mic to see your pitch.</p></div></div><button className="outline-button"><Mic2 size={15} /> Enable mic</button></section>
            </aside>
          </section>
        </div>
      </section>
    </main>
  )
}
