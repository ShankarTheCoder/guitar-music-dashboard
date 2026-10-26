import { NextResponse } from 'next/server'

// India's most-popular videos, filtered the same way as search
// (full-length videos only, no Shorts), with the same detail fields:
// like / comment counts and channel avatars, like YouTube's own cards.
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

  type RawItem = {
    id: string
    snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string; thumbnails?: { medium?: { url: string } } }
    contentDetails?: { duration?: string }
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
  }

  const base = (data.items ?? [] as RawItem[])
    .map((item: RawItem) => {
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
        likeCount: item.statistics?.likeCount ?? '',
        commentCount: item.statistics?.commentCount ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
        description: item.snippet?.description ?? '',
        _seconds: seconds,
      }
    })
    .filter((item: { title: string; _seconds: number }) => {
      const isShort = /#shorts?\b|#ytshorts\b|\bshorts?\b/i.test(item.title) || item._seconds <= 60
      return !isShort
    })

  // Channel avatars, one batched call. Decorative: failures still return items.
  let avatars = new Map<string, string>()
  try {
    const channelIds = [...new Set(base.map((item: { channelId: string }) => item.channelId).filter(Boolean))]
    if (channelIds.length > 0) {
      const avatarParams = new URLSearchParams({ part: 'snippet', id: channelIds.slice(0, 50).join(','), key: apiKey })
      const avatarResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?${avatarParams}`, {
        headers: { Referer: referer },
        next: { revalidate: 300 },
      })
      const avatarData = await avatarResponse.json()
      if (avatarResponse.ok) {
        for (const item of avatarData.items ?? []) avatars.set(item.id, item.snippet?.thumbnails?.default?.url ?? '')
      }
    }
  } catch { /* avatars are decorative */ }

  const items = base.map(({ _seconds, ...item }: { _seconds: number } & Record<string, unknown>) => ({
    ...item,
    channelAvatar: avatars.get(item.channelId as string) ?? '',
  }))

  return NextResponse.json({ items, nextPageToken: null })
}
