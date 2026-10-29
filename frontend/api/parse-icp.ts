import { ParseError, parseIcp } from './_lib/parseIcp'

/** POST /api/parse-icp  { prompt } -> { filters, goal }. Runs server-side so the Ollama key stays secret. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { prompt?: unknown }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 500) : ''
  if (!prompt) return Response.json({ detail: 'prompt is required' }, { status: 422 })

  try {
    return Response.json(await parseIcp(prompt))
  } catch (e) {
    const err = e instanceof ParseError ? e : new ParseError('Unexpected error while translating.')
    return Response.json({ detail: err.message }, { status: err.status })
  }
}
