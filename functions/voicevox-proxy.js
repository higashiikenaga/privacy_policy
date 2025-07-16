export async function onRequest(context) {
  const { request: clientRequest } = context;
  const clientRequestUrl = new URL(clientRequest.url);

  console.log(`[VoicevoxProxy] Request: ${clientRequest.method} ${clientRequestUrl.pathname}${clientRequestUrl.search}`);

  const voicevoxPath = clientRequestUrl.pathname.replace(/^\/voicevox-proxy/, '');

  if (voicevoxPath !== '/synthesis' && voicevoxPath !== '/audio_query') {
    const message = `Unsupported API path: ${voicevoxPath}. Only /synthesis or /audio_query are supported.`;
    console.warn(`[VoicevoxProxy] ${message}`);
    return new Response(JSON.stringify({ success: false, message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const text = clientRequestUrl.searchParams.get('text');
  const speaker = clientRequestUrl.searchParams.get('speaker');

  if (!text || !speaker) {
    const missingParams = ['text', 'speaker'].filter(p => !clientRequestUrl.searchParams.get(p));
    const message = `Missing query parameter(s): ${missingParams.join(', ')}. Both 'text' and 'speaker' are required.`;
    console.warn(`[VoicevoxProxy] Bad request: ${message}`);
    return new Response(JSON.stringify({ success: false, message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const targetApiEndpoint = 'https://api.tts.quest/v3/voicevox/synthesis';
  const targetUrl = new URL(targetApiEndpoint);
  targetUrl.searchParams.set('text', text);
  targetUrl.searchParams.set('speaker', speaker);

  const headersToVoicevox = new Headers({
    'Accept': 'application/json',
    'User-Agent': 'VoicevoxProxy/1.1 (+https://yukiecho.com/news)',
  });

  try {
    console.log(`[VoicevoxProxy] Fetching: GET ${targetUrl.toString()}`);
    const responseFromVoicevox = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: headersToVoicevox,
      // redirect: 'follow' は fetch のデフォルトなので省略可
    });

    const upstreamStatus = responseFromVoicevox.status;
    const upstreamContentType = responseFromVoicevox.headers.get('Content-Type');
    console.log(`[VoicevoxProxy] Upstream status: ${upstreamStatus}, Content-Type: ${upstreamContentType}`);

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    // クライアントはJSONを期待しているので、Content-Typeは 'application/json' にする
    responseHeaders.set('Content-Type', 'application/json; charset=utf-8');


    if (!responseFromVoicevox.ok || (responseFromVoicevox.ok && upstreamContentType && !upstreamContentType.toLowerCase().startsWith('application/json'))) {
      let errorMessage;
      let clientStatus = upstreamStatus;
      let errorDetail = `Upstream API status: ${upstreamStatus} ${responseFromVoicevox.statusText || ''}, Content-Type: ${upstreamContentType || 'N/A'}`;

      if (responseFromVoicevox.ok) { // Upstream sent 2xx but with wrong content type
        errorMessage = `Target API responded with 2xx status (${upstreamStatus}) but unexpected Content-Type: '${upstreamContentType}'. Expected 'application/json'.`;
        clientStatus = 502; // Bad Gateway
        console.warn(`[VoicevoxProxy] ${errorMessage}`);
      } else { // Upstream sent a non-2xx error status
        errorMessage = `Target API responded with error: ${upstreamStatus} ${responseFromVoicevox.statusText || ''}`;
        console.warn(`[VoicevoxProxy] ${errorMessage}`);
      }

      try {
        const bodyText = await responseFromVoicevox.text();
        console.warn(`[VoicevoxProxy] Upstream response body (first 500 chars): ${bodyText.substring(0, 500)}`);
        // Try to parse and use detail from upstream error if available
        try {
            const parsedError = JSON.parse(bodyText);
            if (parsedError && parsedError.detail) {
                errorMessage = `Target API error: ${parsedError.detail}`;
            } else if (parsedError && parsedError.message) {
                errorMessage = `Target API error: ${parsedError.message}`;
            } else if (bodyText.length < 200 && bodyText.length > 0) {
                errorMessage = `Target API error (${upstreamStatus}): ${bodyText}`;
            }
        } catch (e) { /* ignore JSON parse error, use previous errorMessage */ }
        errorDetail = bodyText.substring(0, 1000); // Include part of the upstream body in our JSON error
      } catch (e) {
        console.warn('[VoicevoxProxy] Could not read target API response body:', e.message);
      }

      return new Response(JSON.stringify({ success: false, message: errorMessage, detail: errorDetail }), {
        status: clientStatus,
        headers: responseHeaders,
      });
    }

    // Success: Upstream response is OK and Content-Type is application/json
    // The body from tts.quest should be { success: true, mp3DownloadUrl: ..., ... }
    // We pass it through.
    return new Response(responseFromVoicevox.body, {
      status: upstreamStatus,
      headers: responseHeaders, // Already set Content-Type to application/json
    });

  } catch (error) {
    console.error('[VoicevoxProxy] General proxy error:', error.message, error.stack);
    const message = `Proxy error: ${error.message}`;
    return new Response(JSON.stringify({ success: false, message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
