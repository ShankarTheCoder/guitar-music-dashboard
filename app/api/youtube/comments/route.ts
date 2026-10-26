import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get('videoId')?.trim()
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!videoId) return NextResponse.json({ error: 'videoId is required.' }, { status: 400 })
  if (!apiKey) return NextResponse.json({ error: 'YouTube search is not configured.' }, { status: 503 })
  const referer = request.headers.get('referer') ?? request.url

  const params = new URLSearchParams({
    part: 'snippet',
    videoId,
    maxResults: '20',
    order: 'relevance',
    textFormat: 'plainText',
    key: apiKey,
  })
  const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`, {
    headers: { Referer: referer },
    next: { revalidate: 300 },
  })
  const data = await response.json()
  if (!response.ok) return NextResponse.json({ error: data.error?.message ?? 'Could not load comments.' }, { status: response.status })

  const items = (data.items ?? []).map((item: {
    id: string
    snippet?: { totalReplyCount?: number; topLevelComment?: { snippet?: { authorDisplayName?: string; authorProfileImageUrl?: string; textDisplay?: string; likeCount?: number; publishedAt?: string } } }
  }) => {
    const comment = item.snippet?.topLevelComment?.snippet
    return {
      id: item.id,
      author: comment?.authorDisplayName ?? '',
      authorImage: comment?.authorProfileImageUrl ?? '',
      text: comment?.textDisplay ?? '',
      likes: comment?.likeCount ?? 0,
      publishedAt: comment?.publishedAt ?? '',
      replies: item.snippet?.totalReplyCount ?? 0,
    }
  })

  return NextResponse.json({ items })
}
