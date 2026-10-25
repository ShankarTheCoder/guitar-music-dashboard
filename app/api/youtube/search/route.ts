import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const params0 = new URL(request.url).searchParams
  const query = params0.get('q')?.trim()
  const channelId = params0.get('channelId')?.trim()
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!query && !channelId) return NextResponse.json({ error: 'Search query is required.' }, { status: 400 })
  if (!apiKey) return NextResponse.json({ error: 'YouTube search is not configured.' }, { status: 503 })

  const lowerQuery = (query ?? '').toLocaleLowerCase()
  const asksForNew = /\b(new|latest|recent|newest|trending|202[4-9]|20[3-9]\d)\b/.test(lowerQuery)
  const asksForOld = /\b(old|classic|retro|evergreen|90s|80s|2000s|2010s)\b/.test(lowerQuery)
  const order = channelId && !query ? 'date' : asksForNew && !asksForOld ? 'date' : 'relevance'
  const pageToken = params0.get('pageToken')?.trim()
  const referer = request.headers.get('referer') ?? request.url
  const collected: Array<{
    item: { id: { videoId: string }; snippet?: { title?: string; channelTitle?: string; channelId?: string; thumbnails?: { medium?: { url: string } } } }
    duration: number
    viewCount: string
    publishedAt: string
    description: string
  }> = []
  let currentPageToken = pageToken
  let lastPageToken: string | null = null

  // YouTube can return Shorts mixed into a relevance page. Read a few result pages
  // server-side so the UI still gets a useful list of full-length videos.
  for (let page = 0; page < 3 && collected.length < 12; page += 1) {
    const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '50', order, videoEmbeddable: 'true', key: apiKey })
    if (query) params.set('q', query)
    if (channelId) params.set('channelId', channelId)
    if (currentPageToken) params.set('pageToken', currentPageToken)
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { headers: { Referer: referer }, next: { revalidate: 60 } })
    const data = await response.json()
    if (!response.ok) return NextResponse.json({ error: data.error?.message ?? 'YouTube search failed.' }, { status: response.status })

    const items = (data.items ?? []).filter((item: { id?: { videoId?: string } }) => item.id?.videoId)
    const ids = items.map((item: { id: { videoId: string } }) => item.id.videoId).join(',')
    if (!ids) break

    const detailsParams = new URLSearchParams({ part: 'contentDetails,snippet,statistics', id: ids, key: apiKey })
    const detailsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams}`, { headers: { Referer: referer }, next: { revalidate: 60 } })
    const detailsData = await detailsResponse.json()
    if (!detailsResponse.ok) return NextResponse.json({ error: detailsData.error?.message ?? 'Could not read video details.' }, { status: detailsResponse.status })

    const durations = new Map<string, number>()
    const meta = new Map<string, { viewCount: string; publishedAt: string; description: string }>()
    for (const item of detailsData.items ?? []) {
      const match = item.contentDetails?.duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
      if (match) durations.set(item.id, Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0))
      meta.set(item.id, {
        viewCount: item.statistics?.viewCount ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
        description: item.snippet?.description ?? '',
      })
    }

    for (const item of items) {
      const title = item.snippet?.title ?? ''
      const duration = durations.get(item.id.videoId)
      const isShort = /#shorts?\b|#ytshorts\b|\bshorts?\b/i.test(title) || (duration !== undefined && duration <= 60)
      if (!isShort && duration !== undefined) {
        const m = meta.get(item.id.videoId) ?? { viewCount: '', publishedAt: '', description: '' }
        collected.push({ item, duration, ...m })
      }
    }

    lastPageToken = data.nextPageToken ?? null
    if (!lastPageToken) break
    currentPageToken = lastPageToken
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
    items: collected.map(({ item, duration, viewCount, publishedAt, description }) => ({
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
