import { Impit } from 'impit';
import { canonicalAvBaseUrl } from '@/lib/actresses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new Impit({ browser: 'chrome', timeout: 20_000 });
const MAX_HTML_BYTES = 2_000_000;
const headers = { 'Cache-Control': 'no-store' };

export type ActressFilm = { code: string; title: string; date: string };

function unavailable(status = 502) {
  return Response.json({ films: [], reason: 'unavailable' }, { status, headers });
}

function parseWorks(html: string): ActressFilm[] {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error('__NEXT_DATA__ not found');
  const data = JSON.parse(match[1]) as {
    props?: { pageProps?: { works?: unknown[] } };
  };
  const works = data.props?.pageProps?.works;
  if (!Array.isArray(works)) throw new Error('works array not found');
  const films = works
    .map((work) => {
      if (!work || typeof work !== 'object') return null;
      const row = work as Record<string, unknown>;
      const code = row.work_id;
      const title = row.title;
      const date = row.min_date;
      if (
        typeof code !== 'string' ||
        typeof title !== 'string' ||
        typeof date !== 'string'
      )
        return null;
      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime())) return null;
      return { code, title, date: parsedDate.toISOString() };
    })
    .filter((film): film is ActressFilm => film !== null);
  films.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return films;
}

export async function GET(request: Request) {
  const avBaseUrl = canonicalAvBaseUrl(
    new URL(request.url).searchParams.get('avBaseUrl'),
  );
  if (!avBaseUrl)
    return Response.json({ films: [], reason: 'invalid-url' }, { status: 400, headers });

  try {
    const response = await client.fetch(avBaseUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
      },
    });
    if (response.status === 404)
      return Response.json({ films: [], reason: 'not-found' }, { status: 404, headers });
    if (!response.ok) return unavailable();

    const contentType = response.headers.get('content-type') ?? '';
    if (!/^text\/html\b/i.test(contentType)) return unavailable();

    const bytes = await response.bytes();
    if (bytes.byteLength > MAX_HTML_BYTES) return unavailable();

    const films = parseWorks(new TextDecoder().decode(bytes));
    return Response.json({ films }, { headers });
  } catch {
    return unavailable();
  }
}
