import { NextResponse } from 'next/server'

// Full channel details, like a YouTube channel page header: avatar,
// banner, handle, subscriber / video / view counts, description.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id')?.trim()
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!id) return NextResponse.json({ error: 'Channel id is required.' }, { status: 400 })
  if (!apiKey) return NextResponse.json({ error: 'YouTube search is not configured.' }, { status: 503 })
  const referer = request.headers.get('referer') ?? request.url

  const params = new URLSearchParams({ part: 'snippet,statistics,brandingSettings', id, key: apiKey })
  const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, {
    headers: { Referer: referer },
    next: { revalidate: 300 },
  })
  const data = await response.json()
  if (!response.ok) return NextResponse.json({ error: data.error?.message ?? 'Could not load channel.' }, { status: response.status })
  const item = data.items?.[0]
  if (!item) return NextResponse.json({ error: 'Channel not found.' }, { status: 404 })

  const hiddenSubs = item.statistics?.hiddenSubscriberCount
  return NextResponse.json({
    id: item.id,
    title: item.snippet?.title ?? '',
    handle: item.snippet?.customUrl ?? '',
    avatar: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    banner: item.brandingSettings?.image?.bannerExternalUrl ?? '',
    subscriberCount: hiddenSubs ? '' : (item.statistics?.subscriberCount ?? ''),
    videoCount: item.statistics?.videoCount ?? '',
    viewCount: item.statistics?.viewCount ?? '',
    description: item.snippet?.description ?? '',
  })
}
