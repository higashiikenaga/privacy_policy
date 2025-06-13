export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Only POST is accepted.' }), { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST' } });
  }

  try {
    const requestBody = await context.request.json();
    const textToSpeak = requestBody.text;
    const apiKey = context.env.GEMINI_API_KEY; // Cloudflare Pagesの環境変数を参照

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'APIキーがサーバーに設定されていません。' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!textToSpeak) {
      return new Response(JSON.stringify({ error: '読み上げるテキストがありません。' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ttsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-to-speech:synthesizeSpeech?key=${apiKey}`;
    const apiResponse = await fetch(ttsApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: textToSpeak },
        voice: { languageCode: 'ja-JP', name: 'ja-JP-Standard-A' }, // 必要に応じて音声名を変更
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      console.error('TTS API Error (from function):', errorData);
      return new Response(JSON.stringify({ error: `TTS APIエラー: ${apiResponse.status} ${errorData.error?.message || '不明なTTSエラー'}` }), {
        status: apiResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await apiResponse.json();
    return new Response(JSON.stringify({ audioContent: data.audioContent }), { // audioContentをそのまま返す
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cloudflare Function Error:', error);
    return new Response(JSON.stringify({ error: 'TTS Function内部エラー: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
