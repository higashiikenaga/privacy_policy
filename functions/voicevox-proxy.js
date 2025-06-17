export async function onRequest(context) {
  const { request } = context;
  const clientRequestUrl = new URL(request.url);

  // クライアントからのリクエストパスをVoicevox APIのパスにマッピング
  // 例: /voicevox-proxy/audio_query -> /audio_query
  const voicevoxPath = clientRequestUrl.pathname.replace(/^\/voicevox-proxy/, '');
  if (!voicevoxPath) {
    return new Response('Voicevox API path missing', { status: 400 });
  }

  const targetUrl = `https://voicevox.su-shiki.com${voicevoxPath}${clientRequestUrl.search}`;

  // クライアントから送られてきたAPIキーを取得
  const apiKey = request.headers.get('X-Custom-Voicevox-Key');

  const headersToVoicevox = {
    'Accept': request.headers.get('Accept') || 'application/json',
    'User-Agent': 'VoicevoxProxy/1.0 (+https://yukiecho.com/news)',
  };

  if (request.method === 'POST' && request.headers.get('Content-Type')) {
    headersToVoicevox['Content-Type'] = request.headers.get('Content-Type');
  }

  if (apiKey) {
    headersToVoicevox['X-Su-Shiki-Key'] = apiKey;
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headersToVoicevox,
      body: request.method === 'POST' ? await request.blob() : null, // POSTの場合はボディを転送
      redirect: 'follow', // リダイレクトに従う
    });

    // Voicevox APIからのレスポンスをCORSヘッダーを付与してクライアントに返す
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*'); // 必要に応じてオリジンを制限

    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error('Error in Voicevox proxy:', error);
    return new Response(`Error proxying to Voicevox API: ${error.message}`, { status: 500 });
  }
}