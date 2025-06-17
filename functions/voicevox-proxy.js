export async function onRequest(context) {
  const { request: clientRequest } = context; // Renamed for clarity
  const clientRequestUrl = new URL(clientRequest.url);

  console.log(`[VoicevoxProxy] Received request: ${clientRequest.method} ${clientRequestUrl.pathname}${clientRequestUrl.search}`);
  clientRequest.headers.forEach((value, key) => {
    console.log(`[VoicevoxProxy] Client Request Header: ${key}: ${value}`);
  });


  // クライアントからのリクエストパスをVoicevox APIのパスにマッピング
  // 例: /voicevox-proxy/audio_query -> /audio_query
  const voicevoxPath = clientRequestUrl.pathname.replace(/^\/voicevox-proxy/, '');
  if (!voicevoxPath) {
    console.error('[VoicevoxProxy] Voicevox API path missing');
    return new Response('Voicevox API path missing', { status: 400 });
  }

  // 新しいベースURLに変更
  let currentTargetUrl = `https://voicevox.su-shiki.com/su-shikiapis/ttsquest${voicevoxPath}${clientRequestUrl.search}`;

  // クライアントから送られてきたAPIキーを取得
  const apiKey = clientRequest.headers.get('X-Custom-Voicevox-Key');
  console.log(`[VoicevoxProxy] API Key from client: ${apiKey ? 'Present' : 'Not Present'}`);

  const initialMethod = clientRequest.method;
  // Read body only if it's a method that typically has one
  const initialBody = (initialMethod === 'POST' || initialMethod === 'PUT' || initialMethod === 'PATCH')
    ? await clientRequest.arrayBuffer() // Use arrayBuffer for easier cloning
    : null;
  if (initialBody) {
    console.log(`[VoicevoxProxy] Initial request body size: ${initialBody.byteLength}`);
  }


  let currentMethod = initialMethod;
  let currentBody = initialBody;

  try {
    for (let i = 0; i < 5; i++) { // Max 5 redirects
      const headersToVoicevox = new Headers(); // Use Headers object for easier management
      headersToVoicevox.set('Accept', clientRequest.headers.get('Accept') || 'application/json');
      headersToVoicevox.set('User-Agent', 'VoicevoxProxy/1.0 (+https://yukiecho.com/news)');

      if (apiKey) {
        headersToVoicevox.set('X-Su-Shiki-Key', apiKey);
      }
      // Add Content-Type only if there's a body and client sent it, and not GET/HEAD
      if (initialBody && clientRequest.headers.get('Content-Type') && currentMethod !== 'GET' && currentMethod !== 'HEAD') { // Check initialBody for Content-Type
        headersToVoicevox.set('Content-Type', clientRequest.headers.get('Content-Type'));
      }

      console.log(`[VoicevoxProxy] Attempt #${i + 1}: Fetching ${currentMethod} ${currentTargetUrl}`);
      headersToVoicevox.forEach((value, key) => {
        console.log(`[VoicevoxProxy] Attempt #${i + 1}: Request Header to Voicevox: ${key}: ${value}`);
      });
      if (currentBody) {
        console.log(`[VoicevoxProxy] Attempt #${i + 1}: Sending body of size ${currentBody.byteLength}`);
      }


      const response = await fetch(currentTargetUrl, {
        method: currentMethod,
        headers: headersToVoicevox,
        body: currentBody,
        redirect: 'manual', // Keep manual
      });
      console.log(`[VoicevoxProxy] Attempt #${i + 1}: Received status ${response.status} from ${currentTargetUrl}`);
      response.headers.forEach((value, key) => {
        console.log(`[VoicevoxProxy] Attempt #${i + 1}: Response Header from Voicevox: ${key}: ${value}`);
      });


      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location');
        if (!location) { // No Location header, treat as final response
          const finalResponseHeaders = new Headers(response.headers);
          finalResponseHeaders.set('Access-Control-Allow-Origin', '*');
          return new Response(response.body, { status: response.status, headers: finalResponseHeaders });
          console.error('[VoicevoxProxy] Redirect status without Location header.');
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
        console.log(`[VoicevoxProxy] Attempt #${i + 1}: Status ${response.status} is final. Returning to client.`);
        const finalResponseHeaders = new Headers(response.headers);
        finalResponseHeaders.set('Access-Control-Allow-Origin', '*'); // Add CORS header
        return new Response(response.body, { status: response.status, headers: finalResponseHeaders });
      }
    }
    console.error('[VoicevoxProxy] Too many redirects.');
    return new Response('Too many redirects', { status: 508 }); // Loop Detected
  } catch (error) {
    console.error('[VoicevoxProxy] Error in proxy:', error.message, error.stack);
    return new Response(`Error proxying to Voicevox API: ${error.message}`, { status: 500 });
  }
}