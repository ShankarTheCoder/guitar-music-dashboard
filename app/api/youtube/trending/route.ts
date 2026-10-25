import { NextResponse } from 'next/server'

// India's most-popular videos, filtered the same way as search
// (full-length videos only, no Shorts).
export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'YouTube search is not configured.' }, { status: 503 })
  const referer = request.headers.get('referer') ?? request.url

  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    chart: 'mostPopular',
    regionCode: 'IN',
    maxResults: '24',
    videoEmbeddable: 'true',
    key: apiKey,
  })
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
    headers: { Referer: referer },
    next: { revalidate: 300 },
  })
  const data = await response.json()
  if (!response.ok) return NextResponse.json({ error: data.error?.message ?? 'Could not load trending videos.' }, { status: response.status })

  function formatDuration(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  const items = (data.items ?? [])
    .map((item: {
      id: string
      snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string; thumbnails?: { medium?: { url: string } } }
      contentDetails?: { duration?: string }
      statistics?: { viewCount?: string }
    }) => {
      const match = item.contentDetails?.duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
      const seconds = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0
      return {
        id: item.id,
        title: item.snippet?.title ?? '',
        channel: item.snippet?.channelTitle ?? '',
        channelId: item.snippet?.channelId ?? '',
        thumbnail: item.snippet?.thumbnails?.medium?.url ?? '',
        duration: formatDuration(seconds),
        viewCount: item.statistics?.viewCount ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
        description: item.snippet?.description ?? '',
        _seconds: seconds,
      }
    })
    .filter((item: { title: string; _seconds: number }) => {
      const isShort = /#shorts?\b|#ytshorts\b|\bshorts?\b/i.test(item.title) || item._seconds <= 60
      return !isShort
    })
    .map(({ _seconds, ...item }: { _seconds: number }) => item)

  return NextResponse.json({ items, nextPageToken: null })
}
