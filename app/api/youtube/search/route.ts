import { NextResponse } from 'next/server'

type SearchItem = {
  id: { videoId: string }
  snippet?: { title?: string; channelTitle?: string; channelId?: string; thumbnails?: { medium?: { url: string } } }
}

type Entry = {
  item: SearchItem
  duration: number
  viewCount: string
  publishedAt: string
  description: string
}

const FILLER = new Set([
  'new', 'latest', 'recent', 'newest', 'trending', 'song', 'songs', 'video', 'videos',
  'official', 'lyrics', 'lyric', 'audio', 'full', 'hd', '4k', 'music', 'hindi', 'punjabi',
  'bhojpuri', 'maithili', 'old', 'classic', 'retro', 'evergreen', '90s', '80s',
])
const TITLE_FILLER = new Set([
  'official', 'video', 'videos', 'song', 'songs', 'lyrics', 'lyric', 'audio', 'full', 'hd', '4k', 'new', 'latest',
])

const wordsOf = (text: string) => text.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const isYear = (w: string) => /^(19|20)\d{2}$/.test(w)

function parseDuration(iso?: string): number | undefined {
  const match = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return undefined
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
}

export async function GET(request: Request) {
  const params0 = new URL(request.url).searchParams
  const query = params0.get('q')?.trim()
  const channelId = params0.get('channelId')?.trim()
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!query && !channelId) return NextResponse.json({ error: 'Search query is required.' }, { status: 400 })
  if (!apiKey) return NextResponse.json({ error: 'YouTube search is not configured.' }, { status: 503 })

  const referer = request.headers.get('referer') ?? request.url
  const pageToken = params0.get('pageToken')?.trim()

  // Content words of the query, minus generic fillers. Used to find the
  // artist's own channel ("new honey singh song" -> honey, singh). Needs at
  // least two words, otherwise any big channel could match by accident.
  const contentWords = wordsOf(query ?? '').filter((w) => w.length > 1 && !FILLER.has(w) && !isYear(w))
  const useArtist = contentWords.length >= 2 && !channelId

  const yt = async (path: string, params: URLSearchParams) => {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${params}`, {
      headers: { Referer: referer },
      next: { revalidate: 60 },
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message ?? `YouTube ${path} failed.`)
    return data
  }

  // Enrich raw search items with duration / views / upload date, and drop
  // Shorts (title tag or 60 seconds or less). Only full-length videos play
  // as songs.
  const enrich = async (rawItems: unknown): Promise<Entry[]> => {
    const items = ((rawItems ?? []) as SearchItem[]).filter((item) => item.id?.videoId)
    const ids = items.map((item) => item.id.videoId).join(',')
    if (!ids) return []
    const detailsParams = new URLSearchParams({ part: 'contentDetails,snippet,statistics', id: ids, key: apiKey })
    const detailsData = await yt('videos', detailsParams)
    const durations = new Map<string, number>()
    const meta = new Map<string, { viewCount: string; publishedAt: string; description: string }>()
    for (const item of detailsData.items ?? []) {
      const duration = parseDuration(item.contentDetails?.duration)
      if (duration !== undefined) durations.set(item.id, duration)
      meta.set(item.id, {
        viewCount: item.statistics?.viewCount ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
        description: item.snippet?.description ?? '',
      })
    }
    const out: Entry[] = []
    for (const item of items) {
      const title = item.snippet?.title ?? ''
      const duration = durations.get(item.id.videoId)
      const isShort = /#shorts?\b|#ytshorts\b|\bshorts?\b/i.test(title) || (duration !== undefined && duration <= 60)
      if (!isShort && duration !== undefined) {
        const m = meta.get(item.id.videoId) ?? { viewCount: '', publishedAt: '', description: '' }
        out.push({ item, duration, ...m })
      }
    }
    return out
  }

  const collectPage = async (searchParams: URLSearchParams): Promise<Entry[]> => {
    const data = await yt('search', searchParams)
    return enrich(data.items)
  }

  // General keyword search, newest first. When an artist lookup will run,
  // fewer general candidates are needed because the official videos lead.
  const generalCap = useArtist ? 12 : 24
  const general: Entry[] = []
  let currentPageToken = pageToken
  let lastPageToken: string | null = null
  for (let page = 0; page < 3 && general.length < generalCap; page += 1) {
    const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '50', order: 'date', videoEmbeddable: 'true', key: apiKey })
    if (query) params.set('q', query)
    if (channelId) params.set('channelId', channelId)
    if (currentPageToken) params.set('pageToken', currentPageToken)
    const data = await yt('search', params)
    general.push(...(await enrich(data.items)))
    lastPageToken = data.nextPageToken ?? null
    if (!lastPageToken) break
    currentPageToken = lastPageToken
  }

  // Subscriber counts for the general results, so big label channels
  // (T-Series and the like) can outrank small copy channels.
  const subs = new Map<string, number>()
  try {
    const channelIds = [...new Set(general.map((e) => e.item.snippet?.channelId).filter(Boolean))] as string[]
    if (channelIds.length > 0) {
      const params = new URLSearchParams({ part: 'statistics', id: channelIds.slice(0, 50).join(','), key: apiKey })
      const data = await yt('channels', params)
      for (const item of data.items ?? []) subs.set(item.id, Number(item.statistics?.subscriberCount ?? 0))
    }
  } catch { /* subscriber data is only a ranking hint */ }

  // Find the artist's own channel: channel search for the content words,
  // keep channels whose name contains at least two of them, and pick the
  // one with the most subscribers (the official channel dwarfs fan copies).
  let artistChannelId: string | null = null
  if (useArtist) {
    try {
      const params = new URLSearchParams({ part: 'snippet', type: 'channel', q: contentWords.join(' '), maxResults: '5', key: apiKey })
      const data = await yt('search', params)
      const candidates = ((data.items ?? []) as { id?: { channelId?: string }; snippet?: { channelTitle?: string } }[])
        .filter((c) => {
          if (!c.id?.channelId) return false
          const nameWords = new Set(wordsOf(c.snippet?.channelTitle ?? ''))
          return contentWords.filter((w) => nameWords.has(w)).length >= 2
        })
      if (candidates.length > 0) {
        let best: string | null = null
        let bestSubs = -1
        try {
          const ids = candidates.map((c) => c.id!.channelId!).join(',')
          const params2 = new URLSearchParams({ part: 'statistics', id: ids, key: apiKey })
          const data2 = await yt('channels', params2)
          for (const item of data2.items ?? []) {
            const n = Number(item.statistics?.subscriberCount ?? 0)
            if (n > bestSubs) { bestSubs = n; best = item.id }
          }
        } catch { /* fall through to the top candidate */ }
        artistChannelId = best ?? candidates[0].id!.channelId!
      }
    } catch { /* no artist channel: general results still apply */ }
  }

  // Official videos, in two parts: the channel's videos matching this exact
  // query (finds a specific song like Blue Eyes), then the channel's latest
  // uploads (finds a brand-new song like So Swaezy).
  let artistQuery: Entry[] = []
  let artistLatest: Entry[] = []
  if (artistChannelId && query) {
    try {
      const [a, b] = await Promise.all([
        collectPage(new URLSearchParams({ part: 'snippet', type: 'video', channelId: artistChannelId, q: query, order: 'relevance', maxResults: '25', videoEmbeddable: 'true', key: apiKey })),
        collectPage(new URLSearchParams({ part: 'snippet', type: 'video', channelId: artistChannelId, order: 'date', maxResults: '25', videoEmbeddable: 'true', key: apiKey })),
      ])
      artistQuery = a
      artistLatest = b.slice(0, 10)
    } catch { /* official tiers are optional; general results still apply */ }
  }

  // Final ranking. First occurrence wins, so an official video can never be
  // pushed down by its own copies: same video id, or same song title once
  // generic words are stripped, is kept only once.
  const titleKey = (title: string) => {
    const key = wordsOf(title).filter((w) => !TITLE_FILLER.has(w) && !isYear(w)).join(' ')
    return key || title.toLocaleLowerCase()
  }
  const nameMatches = (channelTitle: string) => {
    const nameWords = new Set(wordsOf(channelTitle))
    return contentWords.filter((w) => nameWords.has(w)).length >= 2
  }
  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  const ranked: Entry[] = []
  const pushTier = (entries: Entry[]) => {
    for (const entry of entries) {
      const id = entry.item.id.videoId
      const key = titleKey(entry.item.snippet?.title ?? '')
      if (seenIds.has(id) || seenKeys.has(key)) continue
      seenIds.add(id)
      seenKeys.add(key)
      ranked.push(entry)
    }
  }
  pushTier(artistQuery)
  pushTier(artistLatest)
  pushTier(general.filter((e) => nameMatches(e.item.snippet?.channelTitle ?? '')))
  pushTier(general.filter((e) => (subs.get(e.item.snippet?.channelId ?? '') ?? 0) >= 1_000_000))
  pushTier(general)

  function formatDuration(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  return NextResponse.json({
    items: ranked.map(({ item, duration, viewCount, publishedAt, description }) => ({
      id: item.id.videoId,
      title: item.snippet?.title ?? '',
      channel: item.snippet?.channelTitle ?? '',
      channelId: item.snippet?.channelId ?? '',
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? '',
      duration: formatDuration(duration),
      viewCount,
      publishedAt,
      description,
    })),
    nextPageToken: lastPageToken,
  })
}
