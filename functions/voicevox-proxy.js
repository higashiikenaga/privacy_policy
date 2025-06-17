export async function onRequest(context) {
  const { request: clientRequest } = context; // Renamed for clarity
  const clientRequestUrl = new URL(clientRequest.url);

  // クライアントからのリクエストパスをVoicevox APIのパスにマッピング
  // 例: /voicevox-proxy/audio_query -> /audio_query
  const voicevoxPath = clientRequestUrl.pathname.replace(/^\/voicevox-proxy/, '');
  if (!voicevoxPath) {
    return new Response('Voicevox API path missing', { status: 400 });
  }

  let currentTargetUrl = `https://voicevox.su-shiki.com${voicevoxPath}${clientRequestUrl.search}`;

  // クライアントから送られてきたAPIキーを取得
  const apiKey = clientRequest.headers.get('X-Custom-Voicevox-Key');

  const initialMethod = clientRequest.method;
  // Read body only if it's a method that typically has one
  const initialBody = (initialMethod === 'POST' || initialMethod === 'PUT' || initialMethod === 'PATCH')
    ? await clientRequest.blob()
    : null;

  let currentMethod = initialMethod;
  let currentBody = initialBody;

  try {
    for (let i = 0; i < 5; i++) { // Max 5 redirects
      const headersToVoicevox = {
        'Accept': clientRequest.headers.get('Accept') || 'application/json',
        'User-Agent': 'VoicevoxProxy/1.0 (+https://yukiecho.com/news)',
      };
      if (apiKey) {
        headersToVoicevox['X-Su-Shiki-Key'] = apiKey;
      }
      // Add Content-Type only if there's a body and client sent it, and not GET/HEAD
      if (currentBody && clientRequest.headers.get('Content-Type') && currentMethod !== 'GET' && currentMethod !== 'HEAD') {
        headersToVoicevox['Content-Type'] = clientRequest.headers.get('Content-Type');
      }

      const response = await fetch(currentTargetUrl, {
        method: currentMethod,
        headers: headersToVoicevox,
        body: currentBody,
        redirect: 'manual', // Handle redirects manually
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location');
        if (!location) { // No Location header, treat as final response
          const finalResponseHeaders = new Headers(response.headers);
          finalResponseHeaders.set('Access-Control-Allow-Origin', '*');
          return new Response(response.body, { status: response.status, headers: finalResponseHeaders });
        }
        currentTargetUrl = new URL(location, currentTargetUrl).toString(); // Resolve relative URLs

        // Adjust method and body for the next request based on redirect type
        if (response.status === 303) {
          currentMethod = 'GET';
          currentBody = null;
        } else if ((response.status === 301 || response.status === 302) && currentMethod === 'POST') {
          // Preserve POST method for 301/302 redirects, common for APIs
          // currentMethod remains 'POST' (or initialMethod if it was POST)
          // currentBody remains initialBody (or the body from the previous POST)
        }
        // For 307, 308, method and body are preserved (no changes to currentMethod/currentBody needed here)
        // For GET/HEAD on 301/302, method and body are also preserved.
        continue; // Attempt next request in the redirect chain
      }

      // Not a redirect we are handling in a loop, or it's the final response
      const finalResponseHeaders = new Headers(response.headers);
      finalResponseHeaders.set('Access-Control-Allow-Origin', '*'); // Add CORS header
      return new Response(response.body, { status: response.status, headers: finalResponseHeaders });
    }
    return new Response('Too many redirects', { status: 508 }); // Loop Detected
  } catch (error) {
    console.error('Error in Voicevox proxy:', error);
    return new Response(`Error proxying to Voicevox API: ${error.message}`, { status: 500 });
  }
}