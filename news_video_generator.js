// c/homepages/news_video_generator.js

/**
 * 指定されたテキストをWeb Speech APIで読み上げる非同期関数
 * @param {string} text 読み上げるテキスト
 * @param {SpeechSynthesisVoice} voice 使用する音声 (オプション)
 * @returns {Promise<void>} 読み上げ完了時に解決されるPromise
 */
function speakText(text, voice = null) {
  return new Promise((resolve) => { // reject を削除し、常に resolve するように変更
    if (!window.speechSynthesis) {
      console.warn("Web Speech API is not supported in this browser.");
      resolve(); // 音声なしで進行
      return;
    }

    // 以前の読み上げが残っていればキャンセル
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    console.log(`[speakText] Attempting to speak: "${text.substring(0, 70)}..."`);
    utterance.lang = 'ja-JP';

    if (voice) {
      utterance.voice = voice;
      console.log(`[speakText] Using provided voice: ${voice.name} (lang: ${voice.lang}, default: ${voice.default})`);
    } else {
      const defaultJpVoice = window.speechSynthesis.getVoices().find(v => v.lang === 'ja-JP' && v.default);
      const firstJpVoice = window.speechSynthesis.getVoices().find(v => v.lang === 'ja-JP');
      utterance.voice = defaultJpVoice || firstJpVoice || null;
      console.log(`[speakText] No voice provided. Attempting to use default/first Japanese voice: ${utterance.voice ? utterance.voice.name + ` (lang: ${utterance.voice.lang}, default: ${utterance.voice.default})` : 'Not found'}`);
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    let resolved = false; // 二重解決を防ぐフラグ

    utterance.onend = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    utterance.onerror = (event) => {
      if (!resolved) {
        resolved = true;
        console.error(`[speakText] Speech synthesis error for text "${text.substring(0,70)}...":`, event.error, "Utterance details:", {text: utterance.text.substring(0,70), lang: utterance.lang, voice: utterance.voice ? utterance.voice.name : 'N/A'});
        resolve(); // エラーが発生してもPromiseを解決し、処理を続行する
      }
    };
    
    const timeoutDuration = 30000; // 30秒
    const timeoutId = setTimeout(() => {
        if (!resolved) {
            resolved = true;
            console.warn(`[speakText] Speech synthesis timed out for text "${text.substring(0,70)}..." after ${timeoutDuration / 1000} seconds.`);
            window.speechSynthesis.cancel(); // 念のためキャンセル
            resolve(); // タイムアウトでも処理は続行
        }
    }, timeoutDuration);

    utterance.onstart = () => {
        clearTimeout(timeoutId); 
        console.log(`[speakText] Speech synthesis started for: "${text.substring(0, 70)}..." with voice: ${utterance.voice ? utterance.voice.name : 'System default'}`);
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * 画像を読み込む非同期関数
 * @param {string} src 画像のURL
 * @returns {Promise<HTMLImageElement>} 読み込み完了時に解決されるPromise (画像要素)
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // img.crossOrigin = "anonymous"; // ローカルファイルの場合、影響する可能性があるので一時的にコメントアウト
    img.onload = () => resolve(img);
    img.onerror = (event) => { // 'event' の方が一般的
      console.error(`[loadImage] Failed to load image. Src: ${src}`, event.type, event);
      reject(new Error(`Failed to load image: ${src} (Error type: ${event.type})`));
    };
    console.log(`[loadImage] Attempting to resolve path. Original src: "${src}", Resolved absolute URL: "${new URL(src, document.baseURI).href}"`);
    console.log(`[loadImage] Attempting to load image: ${src}`);
    img.src = src;
  });
}


/**
 * Canvasにテキストを折り返して描画する関数
 */
function wrapText(context, text, x, y, maxWidth, lineHeight, font, color, textAlign = 'left') {
  context.font = font;
  context.fillStyle = color;
  context.textAlign = textAlign;

  const words = text.split(''); 
  let line = '';
  let currentY = y;
  const lines = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n];
    const metrics = context.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push({ text: line, currentY });
      line = words[n];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  lines.push({ text: line, currentY });

  let drawX = x;
  if (textAlign === 'center') {
      drawX = context.canvas.width / 2;
  } else if (textAlign === 'right') {
      drawX = context.canvas.width - x; 
  }

  for (const l of lines) {
    context.fillText(l.text.trim(), drawX, l.currentY);
  }
  context.textAlign = 'left'; // デフォルトに戻す
}


/**
 * ニュースアイテムから動画を生成するメイン関数
 * @param {Array<Object>} newsItems ニュースアイテムの配列
 * @param {HTMLCanvasElement} canvasElement 動画フレームを描画するCanvas要素
 * @param {HTMLElement} outputContainer 生成された動画プレイヤーとリンクを表示するコンテナ
 * @param {Object} options 動画生成オプション
 */
async function generateVideoFromNews(newsItems, canvasElement, outputContainer, options = {}) {
  const ctx = canvasElement.getContext('2d');
  console.log('[VideoGen] Received options:', JSON.parse(JSON.stringify(options, (key, value) => key === 'voice' && value instanceof SpeechSynthesisVoice ? {name: value.name, lang: value.lang} : value)));
  const { opening, defaultSlideDuration = 7000, voice = null } = options; 

  // 追加ログ: opening オブジェクトと backgroundVideo/backgroundImage の存在確認
  if (opening) {
    console.log('[VideoGen] Debug: `opening` options object is present.');
    if (opening.backgroundVideo) {
      console.log(`[VideoGen] Debug: opening.backgroundVideo is set to: "${opening.backgroundVideo}"`);
    } else {
      console.log('[VideoGen] Debug: opening.backgroundVideo is NOT set.');
    }
    if (opening.backgroundImage) {
      console.log(`[VideoGen] Debug: opening.backgroundImage is set to: "${opening.backgroundImage}"`);
    } else {
      console.log('[VideoGen] Debug: opening.backgroundImage is NOT set.');
    }
  } else {
    console.log('[VideoGen] Debug: `opening` options object is NOT present.');
  }

  const stream = canvasElement.captureStream(30); 
  const recorderOptions = { mimeType: 'video/webm;codecs=vp9' };
  if (!MediaRecorder.isTypeSupported(recorderOptions.mimeType)) {
    console.warn(`${recorderOptions.mimeType} is not supported, falling back to default.`);
    delete recorderOptions.mimeType;
  }
  const recorder = new MediaRecorder(stream, recorderOptions);
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const videoURL = URL.createObjectURL(blob);

    if (outputContainer) outputContainer.innerHTML = ''; 

    const videoPlayer = document.createElement('video');
    videoPlayer.src = videoURL;
    videoPlayer.controls = true;
    videoPlayer.style.maxWidth = '100%';

    const downloadLink = document.createElement('a');
    downloadLink.href = videoURL;
    downloadLink.download = 'news_summary_video.webm';
    downloadLink.textContent = 'Download Video';
    downloadLink.style.display = 'block';
    downloadLink.style.marginTop = '10px';

    const targetElement = outputContainer || document.body;
    targetElement.appendChild(videoPlayer);
    targetElement.appendChild(downloadLink);

    console.log(outputContainer ? "動画が指定されたコンテナに追加されました。" : "動画が document.body に追加されました。");
  };

  recorder.start();
  console.log("動画生成を開始しました。");

  // --- オープニングシーン ---
  if (opening && opening.title) {
    console.log("[VideoGen] Opening: Starting generation...");
    let opRenderedSuccessfully = false;

    if (opening.backgroundVideo) {
      console.log(`[VideoGen] Opening Scene: Attempting to use background video: "${opening.backgroundVideo}"`);
      try {
        const video = document.createElement('video');
        // video.crossOrigin = 'anonymous'; // ローカルファイルの場合、影響する可能性があるので一時的にコメントアウト
        video.muted = true; 
        console.log(`[VideoGen] Opening: Attempting to resolve video path. Original src: "${opening.backgroundVideo}", Resolved absolute URL: "${new URL(opening.backgroundVideo, document.baseURI).href}"`);
        video.src = opening.backgroundVideo;
        console.log(`[VideoGen] Opening: Video element created, src set to: ${video.src}`);
        
        await new Promise((resolve, reject) => {
            video.oncanplaythrough = () => { console.log("[VideoGen] Opening: Video can play through."); resolve(); };
            video.onerror = (e) => {
                console.error(`[VideoGen] Opening: Failed to load video. Src: ${opening.backgroundVideo}`, video.error || e);
                reject(new Error(`Failed to load video: ${opening.backgroundVideo} (Error: ${video.error ? video.error.message : 'Unknown media error'})`));
            };
            video.onloadeddata = () => console.log("[VideoGen] Opening: Video data loaded.");
            video.onstalled = () => console.warn(`[VideoGen] Opening: Video loading stalled for ${opening.backgroundVideo}.`);
            video.onsuspend = () => console.warn(`[VideoGen] Opening: Video loading suspended for ${opening.backgroundVideo}.`);
            video.load(); // 明示的にロードを開始
            console.log(`[VideoGen] Opening: video.load() called for ${opening.backgroundVideo}.`);
        });
        await video.play();

        const opFrameInterval = 1000 / 30; // 30fps
        let opElapsedTime = 0;
        const opDuration = opening.duration || 5000;

        while (opElapsedTime < opDuration && !video.ended) {
          // console.log(`[VideoGen] Opening: Drawing video frame. Elapsed: ${opElapsedTime}, Video currentTime: ${video.currentTime}`);
          ctx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
          const opTitleFont = `${canvasElement.height * 0.08}px Meiryo, Arial, sans-serif`;
          const opTitleColor = opening.titleColor || 'white';
          const opTitleMaxWidth = canvasElement.width * 0.8;
          const opTitleLineHeight = canvasElement.height * 0.1;
          wrapText(ctx, opening.title, 0, canvasElement.height * 0.45, opTitleMaxWidth, opTitleLineHeight, opTitleFont, opTitleColor, 'center');
          
          await new Promise(r => setTimeout(r, opFrameInterval));
          opElapsedTime += opFrameInterval;
        }
        video.pause();
        opRenderedSuccessfully = true;
        console.log("[VideoGen] Opening: Video part successfully rendered.");
      } catch (e) {
        console.warn(`[VideoGen] Opening: Video processing failed. Fallback will be attempted. Error: ${e.message}`, e);
      }
    }

    if (!opRenderedSuccessfully && opening.backgroundImage) {
      console.log(`[VideoGen] Opening Scene: Fallback - Attempting to use background image: "${opening.backgroundImage}"`);
      try {
        const bgImg = await loadImage(opening.backgroundImage);
        ctx.drawImage(bgImg, 0, 0, canvasElement.width, canvasElement.height);
        opRenderedSuccessfully = true;
        console.log("[VideoGen] Opening: Background image successfully rendered.");
      } catch (e) {
        console.warn(`[VideoGen] Opening: Background image loading failed. Error: ${e.message}`, e);
      }
    }
    
    if (!opRenderedSuccessfully) {
        console.log(`[VideoGen] Opening: No video or image background rendered. Using background color: ${opening.backgroundColor || '#003366'}`);
        ctx.fillStyle = opening.backgroundColor || '#003366';
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    // タイトル描画 (動画・静止画背景が成功しなかった場合、または動画の上に重ねない場合)
    if (!opRenderedSuccessfully || !opening.backgroundVideo) { // 動画の場合は描画ループ内でタイトル描画済み
        const opTitleFont = `${canvasElement.height * 0.08}px Meiryo, Arial, sans-serif`;
        const opTitleColor = opening.titleColor || 'white';
        const opTitleMaxWidth = canvasElement.width * 0.8;
        const opTitleLineHeight = canvasElement.height * 0.1;
        wrapText(ctx, opening.title, 0, canvasElement.height * 0.45, opTitleMaxWidth, opTitleLineHeight, opTitleFont, opTitleColor, 'center');
    }

    if (opening.audioText) {
        console.log(`[VideoGen] Opening: Attempting to speak audioText: "${opening.audioText.substring(0,50)}..."`);
        await speakText(opening.audioText, voice); // speakTextはエラーでもresolveする
    }
    // オープニングの表示時間（音声がない場合や、音声再生後の追加待機）
    // 動画の場合はopDurationで制御済みなので、ここでは音声がない場合の待機のみ考慮
    if (!opening.backgroundVideo && !opening.audioText) {
        await new Promise(resolve => setTimeout(resolve, opening.duration || 3000));
    } else if (!opening.backgroundVideo && opening.audioText) {
        // 音声再生後、指定durationからある程度引いた時間待つか、固定時間待つ
        await new Promise(resolve => setTimeout(resolve, Math.max(500, (opening.duration || 3000) / 2) ));
    }
  }

  // --- ニュースアイテムシーン ---
  for (const item of newsItems) {
    console.log(`[VideoGen] Item Scene: Starting generation for "${item.title.substring(0,50)}..."`);
    // 追加ログ: item.backgroundImage の存在確認
    if (item.backgroundImage) {
        console.log(`[VideoGen] Item Scene Debug: item.backgroundImage for "${item.title.substring(0,50)}..." is set to: "${item.backgroundImage}"`);
    } else {
        console.log(`[VideoGen] Item Scene Debug: item.backgroundImage for "${item.title.substring(0,50)}..." is NOT set.`);
    }

    let itemBgRendered = false;
    if (item.backgroundImage) {
      console.log(`[VideoGen] Item Scene: Attempting to use background image: "${item.backgroundImage}" for item "${item.title.substring(0,50)}..."`);
      try {
        const bgImg = await loadImage(item.backgroundImage);
        ctx.drawImage(bgImg, 0, 0, canvasElement.width, canvasElement.height);
        itemBgRendered = true;
        console.log(`[VideoGen] Item Scene: Background image "${item.backgroundImage}" successfully rendered for "${item.title.substring(0,50)}".`);
      } catch (e) {
        console.warn(`[VideoGen] Item Scene: Background image "${item.backgroundImage}" loading failed for "${item.title.substring(0,50)}". Error: ${e.message}`, e);
      }
    }
    
    if (!itemBgRendered) {
      console.log(`[VideoGen] Item Scene: No background image rendered for "${item.title.substring(0,50)}". Using background color: ${item.backgroundColor || 'white'}`);
      ctx.fillStyle = item.backgroundColor || 'white';
      ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }
    if (item.imageUrl) {
      try {
        const img = await loadImage(item.imageUrl);
        const imgMaxHeight = canvasElement.height * 0.5;
        const imgMaxWidth = canvasElement.width * 0.7;
        let drawWidth = img.width;
        let drawHeight = img.height;
        const aspectRatio = img.width / img.height;

        if (drawHeight > imgMaxHeight) {
          drawHeight = imgMaxHeight;
          drawWidth = drawHeight * aspectRatio;
        }
        if (drawWidth > imgMaxWidth) {
          drawWidth = imgMaxWidth;
          drawHeight = drawWidth / aspectRatio;
        }
        const x = (canvasElement.width - drawWidth) / 2;
        const y = canvasElement.height * 0.15;
        ctx.drawImage(img, x, y, drawWidth, drawHeight);
      } catch (error) {
        console.error("ニュース画像の読み込みに失敗しました:", item.imageUrl, error);
      }
    }
    
    const titleFont = `${canvasElement.height * 0.06}px Meiryo, Arial, sans-serif`;
    const currentBgFill = ctx.fillStyle; // 現在の背景色を取得 (近似)
    let titleColor = 'black';
    // 背景が暗い色かを簡易的に判定 (より正確には輝度計算が必要)
    if (typeof currentBgFill === 'string') {
        const lowerFill = currentBgFill.toLowerCase();
        if (lowerFill === 'black' || lowerFill === '#000000' || lowerFill.startsWith('rgb(0,0,0') || lowerFill.startsWith('rgba(0,0,0')) {
            titleColor = 'white';
        } else if (lowerFill.startsWith('#')) { // HEX
            const r = parseInt(lowerFill.substring(1,3), 16);
            const g = parseInt(lowerFill.substring(3,5), 16);
            const b = parseInt(lowerFill.substring(5,7), 16);
            if ((r*0.299 + g*0.587 + b*0.114) < 128) titleColor = 'white'; // 簡易輝度
        }
    }


    const titleMaxWidth = canvasElement.width * 0.9;
    const titleLineHeight = canvasElement.height * 0.07;
    const titleY = item.imageUrl ? canvasElement.height * 0.7 : canvasElement.height * 0.45;

    wrapText(ctx, item.title, 0, titleY, titleMaxWidth, titleLineHeight, titleFont, titleColor, 'center');

    const audioToSpeak = item.audioText || item.title;
    const slideDuration = item.slideDuration || defaultSlideDuration;

    console.log(`[VideoGen] Item Scene: Attempting to speak audioText for "${item.title.substring(0,50)}...": "${audioToSpeak.substring(0,50)}..."`);
    await speakText(audioToSpeak, voice); // speakTextはエラーでもresolveする
    console.log(`[VideoGen] Item Scene: Finished speakText for "${item.title.substring(0,50)}". Waiting for slide duration.`);
    await new Promise(resolve => setTimeout(resolve, Math.max(1000, slideDuration / 2) )); // 音声再生後、またはエラー後も少し待つ
  }

  recorder.stop();
  console.log("[VideoGen] Video generation process stopped. Recorder stopped.");
}
