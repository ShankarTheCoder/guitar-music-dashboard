import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim()
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!query) return NextResponse.json({ error: 'Search query is required.' }, { status: 400 })
  if (!apiKey) return NextResponse.json({ error: 'YouTube search is not configured. Add YOUTUBE_API_KEY in the project Vars.' }, { status: 503 })

  const lowerQuery = query.toLocaleLowerCase()
  const asksForNew = /\b(new|latest|recent|newest|trending|202[4-9]|20[3-9]\d)\b/.test(lowerQuery)
  const asksForOld = /\b(old|classic|retro|evergreen|90s|80s|2000s|2010s)\b/.test(lowerQuery)
  const order = asksForNew && !asksForOld ? 'date' : 'relevance'

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: '50',
    order,
    videoEmbeddable: 'true',
    key: apiKey,
  })
  const referer = request.headers.get('referer') ?? request.url
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
    headers: { Referer: referer },
    next: { revalidate: 60 },
  })
  const data = await response.json()

  if (!response.ok) return NextResponse.json({ error: data.error?.message ?? 'YouTube search failed.' }, { status: response.status })

  return NextResponse.json({ items: data.items ?? [] })
}
