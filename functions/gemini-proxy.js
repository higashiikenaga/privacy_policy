export async function onRequest(context) {
  const { request, env } = context; // env から環境変数を取得

  // 環境変数からAPIキーを取得
  const geminiApiKey = env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    console.error('[GeminiProxy] GEMINI_API_KEY environment variable not set.');
    return new Response('Gemini API key not configured on server.', { status: 500 });
  }

  if (request.method !== 'POST') {
    return new Response('Only POST requests are allowed', { status: 405 });
  }

  try {
    const requestBody = await request.json(); // クライアントからのリクエストボディを取得

    // Gemini APIのエンドポイント (モデルによって異なる場合がある)
    // ここでは gemini-1.5-flash-latest を想定
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

    const geminiResponse = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody), // クライアントからのリクエストボディをそのまま転送
    });

    const responseBody = await geminiResponse.text(); // テキストとして取得

    // Gemini APIからのレスポンスをCORSヘッダーを付与してクライアントに返す
    const responseHeaders = new Headers(geminiResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*'); // 必要に応じてオリジンを制限
    responseHeaders.set('Content-Type', 'application/json'); // レスポンスタイプをJSONに設定

    return new Response(responseBody, { status: geminiResponse.status, headers: responseHeaders });
  } catch (error) {
    console.error('[GeminiProxy] Error proxying to Gemini API:', error);
    return new Response(`Error proxying to Gemini API: ${error.message}`, { status: 500 });
  }
}