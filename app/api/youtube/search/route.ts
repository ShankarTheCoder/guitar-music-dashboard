import { NextResponse } from 'next/server'

type SearchItem = {
  id: { videoId: string }
  snippet?: { title?: string; channelTitle?: string; channelId?: string; thumbnails?: { medium?: { url: string } } }
}

type Entry = {
  item: SearchItem
  duration: number
  viewCount: string
  likeCount: string
  commentCount: string
  publishedAt: string
  description: string
  channelAvatar?: string
}

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
    const meta = new Map<string, { viewCount: string; likeCount: string; commentCount: string; publishedAt: string; description: string }>()
    for (const item of detailsData.items ?? []) {
      const duration = parseDuration(item.contentDetails?.duration)
      if (duration !== undefined) durations.set(item.id, duration)
      meta.set(item.id, {
        viewCount: item.statistics?.viewCount ?? '',
        likeCount: item.statistics?.likeCount ?? '',
        commentCount: item.statistics?.commentCount ?? '',
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
        const m = meta.get(item.id.videoId) ?? { viewCount: '', likeCount: '', commentCount: '', publishedAt: '', description: '' }
        out.push({ item, duration, ...m })
      }
    }
    return out
  }

  // Search order matches YouTube itself: a text search uses relevance
  // order, exactly like youtube.com/results. A channel page uses newest
  // first, like a channel's Videos tab.
  const order = channelId ? 'date' : 'relevance'
  const collected: Entry[] = []
  let currentPageToken = pageToken
  let lastPageToken: string | null = null
  for (let page = 0; page < 3 && collected.length < 24; page += 1) {
    const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '50', order, videoEmbeddable: 'true', key: apiKey })
    if (query) params.set('q', query)
    if (channelId) params.set('channelId', channelId)
    if (currentPageToken) params.set('pageToken', currentPageToken)
    const data = await yt('search', params)
    collected.push(...(await enrich(data.items)))
    lastPageToken = data.nextPageToken ?? null
    if (!lastPageToken) break
    currentPageToken = lastPageToken
  }

  // Channel avatars for every channel in the results, one batched call.
  // Avatars are decorative: if the call fails, results still go out.
  try {
    const channelIds = [...new Set(collected.map((e) => e.item.snippet?.channelId).filter(Boolean))] as string[]
    if (channelIds.length > 0) {
      const params = new URLSearchParams({ part: 'snippet', id: channelIds.slice(0, 50).join(','), key: apiKey })
      const data = await yt('channels', params)
      const avatars = new Map<string, string>()
      for (const item of data.items ?? []) avatars.set(item.id, item.snippet?.thumbnails?.default?.url ?? '')
      for (const entry of collected) entry.channelAvatar = avatars.get(entry.item.snippet?.channelId ?? '') ?? ''
    }
  } catch { /* avatars are decorative */ }

  // Collapse exact re-uploads of the same song title (same words once
  // generic words are stripped), keeping the first — most relevant — copy.
  // Versions with different words (AADAT vs AADAT 8K, So Swaezy vs its
  // teaser) are different entries on YouTube too, so both stay.
  const titleKey = (title: string) => {
    const key = wordsOf(title).filter((w) => !TITLE_FILLER.has(w) && !isYear(w)).join(' ')
    return key || title.toLocaleLowerCase()
  }
  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  const ranked: Entry[] = []
  for (const entry of collected) {
    const id = entry.item.id.videoId
    const key = titleKey(entry.item.snippet?.title ?? '')
    if (seenIds.has(id) || seenKeys.has(key)) continue
    seenIds.add(id)
    seenKeys.add(key)
    ranked.push(entry)
  }

  function formatDuration(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  return NextResponse.json({
    items: ranked.map(({ item, duration, viewCount, likeCount, commentCount, publishedAt, description, channelAvatar }) => ({
      id: item.id.videoId,
      title: item.snippet?.title ?? '',
      channel: item.snippet?.channelTitle ?? '',
      channelId: item.snippet?.channelId ?? '',
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? '',
      duration: formatDuration(duration),
      viewCount,
      likeCount,
      commentCount,
      publishedAt,
      description,
      channelAvatar: channelAvatar ?? '',
    })),
    nextPageToken: lastPageToken,
  })
}
