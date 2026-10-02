import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim()
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!query) return NextResponse.json({ error: 'Search query is required.' }, { status: 400 })
  if (!apiKey) return NextResponse.json({ error: 'YouTube search is not configured.' }, { status: 503 })

  const lowerQuery = query.toLocaleLowerCase()
  const asksForNew = /\b(new|latest|recent|newest|trending|202[4-9]|20[3-9]\d)\b/.test(lowerQuery)
  const asksForOld = /\b(old|classic|retro|evergreen|90s|80s|2000s|2010s)\b/.test(lowerQuery)
  const order = asksForNew && !asksForOld ? 'date' : 'relevance'
  const pageToken = new URL(request.url).searchParams.get('pageToken')?.trim()
  const params = new URLSearchParams({ part: 'snippet', q: query, type: 'video', maxResults: '50', order, videoEmbeddable: 'true', key: apiKey })
  if (pageToken) params.set('pageToken', pageToken)
  const referer = request.headers.get('referer') ?? request.url
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { headers: { Referer: referer }, next: { revalidate: 60 } })
  const data = await response.json()
  if (!response.ok) return NextResponse.json({ error: data.error?.message ?? 'YouTube search failed.' }, { status: response.status })

  const items = data.items ?? []
  const ids = items.map((item: { id?: { videoId?: string } }) => item.id?.videoId).filter(Boolean).join(',')
  if (!ids) return NextResponse.json({ items: [], nextPageToken: data.nextPageToken ?? null })

  const detailsParams = new URLSearchParams({ part: 'contentDetails', id: ids, key: apiKey })
  const detailsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams}`, { headers: { Referer: referer }, next: { revalidate: 60 } })
  const detailsData = await detailsResponse.json()
  const durations = new Map<string, number>()
  for (const item of detailsData.items ?? []) {
    const match = item.contentDetails?.duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
    if (!match) continue
    durations.set(item.id, Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0))
  }

  const longVideos = items.filter((item: { id: { videoId: string }; snippet?: { title?: string } }) => {
    const title = item.snippet?.title ?? ''
    const isShortTitle = /#shorts?\b|#ytshorts\b|\bshorts?\b/i.test(title)
    const duration = durations.get(item.id.videoId)
    return !isShortTitle && duration !== undefined && duration > 60
  })

  return NextResponse.json({
    items: longVideos.map((item: object) => ({ ...item, videoType: 'Long video' })),
    nextPageToken: data.nextPageToken ?? null,
  })
}
