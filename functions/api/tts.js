// worker.js (Cloudflare Worker)
// このコードはあなたのCloudflare Workerにデプロイされます。

// 環境変数にAPIキーを設定してください (例: GEMINI_API_KEY)
const GEMINI_API_KEY = ENV.GEMINI_API_KEY; // Cloudflare Workersの環境変数から取得

// Gemini TTS APIのエンドポイント
// 実際のAPIエンドポイントはGoogleの公式ドキュメントで確認してください。
// 例: https://texttospeech.googleapis.com/v1/text:synthesize
const GEMINI_TTS_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=';

async function handleRequest(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { text } = await request.json();

    if (!text) {
        return new Response(JSON.stringify({ error: 'Text is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_PLACEHOLDER") {
        return new Response(JSON.stringify({ error: 'Gemini API Key is not configured on the server.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Gemini APIのTTSリクエストボディを構築
        // これは現在のGemini APIのTTSモデルの予想される形式です。
        // 公式ドキュメントで正確な形式を確認してください。
        const ttsRequestBody = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: text }
                    ]
                }
            ],
            // TTS固有の設定 (mode, voice など)
            // Gemini APIのTTSに関する最新の公式ドキュメントを参照してください。
            // 例:
            // output_modality: "AUDIO",
            // audio_config: {
            //     audio_encoding: "MP3",
            //     speaking_rate: 1.0,
            //     pitch: 0.0,
            //     volume_gain_db: 0.0,
            //     voice: {
            //         language_code: "ja-JP",
            //         name: "ja-JP-Wavenet-A" // 日本語の適切な音声を選択
            //     }
            // }
            generation_config: {
                response_mime_type: "audio/mpeg", // MP3形式を指定
            },
        };

        console.log("Sending TTS request to Gemini API. Text length:", text.length);

        const ttsResponse = await fetch(`<span class="math-inline">\{GEMINI\_TTS\_API\_URL\}</span>{GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'x-goog-api-key': GEMINI_API_KEY // 多くのGoogle APIではURLパラメータではなくヘッダーを使うこともあります
            },
            body: JSON.stringify(ttsRequestBody)
        });

        if (!ttsResponse.ok) {
            const errorData = await ttsResponse.json();
            console.error("Gemini TTS API Error:", errorData);
            return new Response(JSON.stringify({ error: `Gemini TTS API call failed: ${errorData.error ? errorData.error.message : JSON.stringify(errorData)}` }), {
                status: ttsResponse.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Gemini TTS APIからのレスポンスを処理
        // generateContentのresponse_mime_typeがaudioの場合、raw response bodyが音声データになります
        const audioBlob = await ttsResponse.arrayBuffer();
        const base64Audio = Buffer.from(audioBlob).toString('base64');


        return new Response(JSON.stringify({ audioContent: base64Audio }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error during TTS proxy:', error);
        return new Response(JSON.stringify({ error: `Internal server error: ${error.message}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});