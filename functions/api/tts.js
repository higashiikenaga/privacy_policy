export async function onRequestPost(context) {
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
        voice: { languageCode: 'ja-JP'}, // 必要に応じて音声名を変更
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });

    if (!apiResponse.ok) {
      let errorResponseMessage = `Google TTS API returned status ${apiResponse.status}`;
      try {
        // Attempt to parse as JSON, but be ready for it to fail
        const errorData = await apiResponse.json();
        errorResponseMessage = `TTS APIエラー: ${apiResponse.status} ${errorData.error?.message || JSON.stringify(errorData)}`;
      } catch (jsonParseError) {
        // If JSON parsing fails, it means Google's error response wasn't JSON
        console.warn('Failed to parse Google TTS API error response as JSON:', jsonParseError.message);
        try {
            const rawErrorText = await apiResponse.text();
            // エラーメッセージが長すぎる場合があるので、一部のみ表示
            errorResponseMessage = `Google TTS API returned status ${apiResponse.status}. Response was not valid JSON: ${rawErrorText.substring(0, 200)}...`;
        } catch (textParseError) {
            console.warn('Failed to read Google TTS API error response as text:', textParseError.message);
            errorResponseMessage = `Google TTS API returned status ${apiResponse.status}. Response was not valid JSON and could not be read as text.`;
        }
      }
      console.error('TTS API Error (from function):', errorResponseMessage);
      // Google APIのエラーステータスをクライアントに伝播させるか、502 (Bad Gateway) を使用
      const statusToReturn = apiResponse.status >= 400 && apiResponse.status < 600 ? apiResponse.status : 502;
      return new Response(JSON.stringify({ error: errorResponseMessage }), {
        status: statusToReturn,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // apiResponse.ok が true の場合でも、念のためレスポンスボディがJSONであることを確認
    const data = await apiResponse.json(); // Google APIが2xxで非JSONを返すことは稀だが、堅牢性のためにtry-catchも検討可
    return new Response(JSON.stringify({ audioContent: data.audioContent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // このcatchブロックは、リクエストボディのJSONパース失敗 (context.request.json()) や、
    // 上記のapiResponse.json()が失敗し、それが適切にcatchされなかった場合などに到達する
    console.error('Cloudflare Function Error:', error.message, error.stack);
    let detailErrorMessage = 'TTS Function内部エラー: ';
    if (error.message.toLowerCase().includes('json input')) {
        detailErrorMessage += 'リクエストまたはAPIレスポンスのJSON解析に失敗しました。';
    } else {
        detailErrorMessage += error.message;
    }
    return new Response(JSON.stringify({ error: detailErrorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
