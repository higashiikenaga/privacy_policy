export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const feedUrl = url.searchParams.get('url');

  if (!feedUrl) {
    return new Response('Missing url query parameter', { status: 400 });
  }

  try {
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'RSSProxy/1.0 (+https://yukiecho.com/news)', // 適切なUser-Agentを設定
      }
    });

    if (!response.ok) {
      return new Response(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`, { status: response.status });
    }

    const text = await response.text();

    return new Response(text, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*', // すべてのオリジンを許可 (必要に応じて制限)
      },
    });
  } catch (error) {
    console.error('Error in RSS proxy:', error);
    return new Response(`Error fetching RSS feed: ${error.message}`, { status: 500 });
  }
}