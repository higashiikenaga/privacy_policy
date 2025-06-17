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

  // 新しいAPIエンドポイント形式に対応
  let targetApiEndpoint = '';
  const queryParams = new URLSearchParams();

  if (voicevoxPath === '/audio_query' || voicevoxPath === '/synthesis') {
    // audio_query と synthesis の両方を新しい synthesis エンドポイントにマッピング
    targetApiEndpoint = 'https://api.tts.quest/v3/voicevox/synthesis';
    // クライアントからのクエリパラメータを取得
    const text = clientRequestUrl.searchParams.get('text');
    const speaker = clientRequestUrl.searchParams.get('speaker');

    if (text) queryParams.set('text', text);
    if (speaker) queryParams.set('speaker', speaker);
  } else {
    console.error(`[VoicevoxProxy] Unsupported path: ${voicevoxPath}`);
    return new Response(`Unsupported API path: ${voicevoxPath}`, { status: 400 });
  }

  let currentTargetUrl = `${targetApiEndpoint}?${queryParams.toString()}`;

  // クライアントから送られてきたAPIキーを取得
  const apiKey = clientRequest.headers.get('X-Custom-Voicevox-Key');
  console.log(`[VoicevoxProxy] API Key from client: ${apiKey ? 'Present' : 'Not Present'}`);
  // 新しいAPIはGETメソッドで、ボディは不要
  const initialMethod = 'GET'; // メソッドをGETに固定
  const initialBody = null;    // ボディは不要

  let currentMethod = initialMethod; // 常にGET
  let currentBody = initialBody;   // 常にnull

  try {
    for (let i = 0; i < 5; i++) { // Max 5 redirects
      const headersToVoicevox = new Headers(); // Use Headers object for easier management
      // tts.questのsynthesisはJSONを返すので、Acceptはapplication/jsonを優先
      headersToVoicevox.set('Accept', 'application/json, */*');
      headersToVoicevox.set('User-Agent', 'VoicevoxProxy/1.0 (+https://yukiecho.com/news)');

      if (apiKey && targetApiEndpoint.includes('su-shiki.com')) { // su-shiki.com の場合のみAPIキーを付与（tts.questは不要）
        headersToVoicevox.set('X-Su-Shiki-Key', apiKey);
      }
      // GETリクエストなのでContent-Typeは不要

      console.log(`[VoicevoxProxy] Attempt #${i + 1}: Fetching ${currentMethod} ${currentTargetUrl}`);
      headersToVoicevox.forEach((value, key) => {
        console.log(`[VoicevoxProxy] Attempt #${i + 1}: Request Header to Voicevox: ${key}: ${value}`);
      });
      if (currentBody) {
        console.log(`[VoicevoxProxy] Attempt #${i + 1}: Sending body of size ${currentBody.byteLength}`);
      } // currentBodyは常にnullのはず


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
          console.error('[VoicevoxProxy] Redirect status without Location header.');
          const finalResponseHeaders = new Headers(response.headers);
          finalResponseHeaders.set('Access-Control-Allow-Origin', '*');
          // Content-Typeを適切に設定
          finalResponseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/json');
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
          console.log(`[VoicevoxProxy] Applying ${response.status} redirect logic: restoring initial method and body.`);
          currentMethod = initialMethod; // 常にGET
          currentBody = initialBody;   // 常にnull
        }
        console.log(`[VoicevoxProxy] Next request will be: Method=${currentMethod}, HasBody=${!!currentBody}`);
        continue; // Attempt next request in the redirect chain
      } else {
        // Not a redirect, treat as final response from target API
        console.log(`[VoicevoxProxy] Attempt #${i + 1}: Status ${response.status} is final. Returning to client.`);
        const finalResponseHeaders = new Headers(response.headers);

        // Check if the response from tts.quest was successful before assuming JSON
        if (!response.ok) {
          // If tts.quest returned an error, pass that status and body through
          // but ensure Access-Control-Allow-Origin is set.
          console.warn(`[VoicevoxProxy] Target API responded with error: ${response.status}`);
        } else {
          finalResponseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/json');
        }
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