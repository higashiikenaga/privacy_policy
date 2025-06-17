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
    ? await clientRequest.arrayBuffer() // Use arrayBuffer for easier cloning
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
      if (initialBody && clientRequest.headers.get('Content-Type') && currentMethod !== 'GET' && currentMethod !== 'HEAD') { // Check initialBody for Content-Type
        headersToVoicevox['Content-Type'] = clientRequest.headers.get('Content-Type');
      }

      const response = await fetch(currentTargetUrl, {
        method: currentMethod,
        headers: headersToVoicevox,
        body: currentBody,
        redirect: 'manual', // Keep manual
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
        console.log(`[VoicevoxProxy] Redirect detected (status ${response.status}). New target: ${currentTargetUrl}`);
        if (response.status === 303) {
          console.log(`[VoicevoxProxy] Applying 303 redirect logic: method to GET, clear body.`);
          currentMethod = 'GET';
          currentBody = null;
        } else { // Handles 301, 302, 307, 308
          // For 301, 302, 307, 308, preserve the original method and re-use/clone the body
          console.log(`[VoicevoxProxy] Applying ${response.status} redirect logic: restoring initial method and body.`);
          currentMethod = initialMethod;
          currentBody = initialBody; // Re-use the ArrayBuffer from initial request
        }
        console.log(`[VoicevoxProxy] Next request will be: Method=${currentMethod}, HasBody=${!!currentBody}`);
        continue; // Attempt next request in the redirect chain
      } else {
        // Not a redirect status we are handling in the loop, or it's a status we don't want to follow further.
        // This is the final response from the current fetch attempt.
        console.log(`[VoicevoxProxy] Fetch attempt ${i + 1}: Received status ${response.status}. Treating as final response.`);
        const finalResponseHeaders = new Headers(response.headers);
        finalResponseHeaders.set('Access-Control-Allow-Origin', '*'); // Add CORS header
        return new Response(response.body, { status: response.status, headers: finalResponseHeaders });
      }
    }
    return new Response('Too many redirects', { status: 508 }); // Loop Detected
  } catch (error) {
    console.error('Error in Voicevox proxy:', error);
    return new Response(`Error proxying to Voicevox API: ${error.message}`, { status: 500 });
  }
}