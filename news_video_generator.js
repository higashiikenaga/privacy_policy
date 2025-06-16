// c/homepages/news_video_generator.js

/**
 * 指定されたテキストをWeb Speech APIで読み上げる非同期関数
 * @param {string} text 読み上げるテキスト
 * @param {SpeechSynthesisVoice} voice 使用する音声 (オプション)
 * @returns {Promise<void>} 読み上げ完了時に解決されるPromise
 */
function speakText(text, voice = null) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      console.warn("Web Speech API is not supported in this browser.");
      resolve(); // 音声なしで進行
      return;
    }

    // 以前の読み上げが残っていればキャンセル
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    if (voice) {
      utterance.voice = voice;
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
        console.error("Speech synthesis error, continuing without audio for this segment:", event.error);
        resolve(); // エラーが発生してもPromiseを解決し、処理を続行する
      }
    };
    
    // 安全のためのタイムアウト (例: 30秒)
    // onendが発火しないケースに対応
    const timeoutId = setTimeout(() => {
        if (!resolved) {
            resolved = true;
            console.warn("Speech synthesis timed out.");
            window.speechSynthesis.cancel(); // 念のためキャンセル
            resolve(); // タイムアウトでも処理は続行
        }
    }, 30000);

    utterance.onstart = () => {
        clearTimeout(timeoutId); // 読み上げが開始されたらタイムアウトは不要
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
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      console.error(`Failed to load image: ${src}`, err);
      reject(new Error(`Failed to load image: ${src} ${err.type || err}`));
    };
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

  const words = text.split(''); // 1文字ずつ分割して細かく改行できるようにする
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
      drawX = context.canvas.width - x; // xを右からのマージンとして解釈する場合
  }


  for (const l of lines) {
    context.fillText(l.text.trim(), drawX, l.currentY);
  }
  context.textAlign = 'left'; // デフォルトに戻す
}


/**
 * ニュースアイテムから動画を生成するメイン関数
 * @param {Array<Object>} newsItems ニュースアイテムの配列 { title: string, imageUrl?: string, audioText?: string, slideDuration?: number, backgroundColor?: string, backgroundImage?: string }
 * @param {HTMLCanvasElement} canvasElement 動画フレームを描画するCanvas要素
 * @param {HTMLElement} outputContainer 生成された動画プレイヤーとリンクを表示するコンテナ
 * @param {Object} options 動画生成オプション { opening?: { title: string, duration: number, backgroundColor?: string, backgroundImage?: string, audioText?: string }, defaultSlideDuration?: number, voice?: SpeechSynthesisVoice }
 */
async function generateVideoFromNews(newsItems, canvasElement, outputContainer, options = {}) {
  const ctx = canvasElement.getContext('2d');
  const { opening, defaultSlideDuration = 7000, voice = null } = options; // デフォルト7秒/スライド

  const stream = canvasElement.captureStream(30); // 30 FPS
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

    if (outputContainer) outputContainer.innerHTML = ''; // 前の出力をクリア

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
    console.log("オープニングを生成中...");
    // 背景描画
    if (opening.backgroundImage) {
      try {
        const bgImg = await loadImage(opening.backgroundImage);
        ctx.drawImage(bgImg, 0, 0, canvasElement.width, canvasElement.height);
      } catch (e) {
        console.warn("オープニング背景画像の読み込みに失敗。デフォルト背景を使用します。", e);
        ctx.fillStyle = opening.backgroundColor || '#003366'; // デフォルトOP背景色
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
      }
    } else {
      ctx.fillStyle = opening.backgroundColor || '#003366';
      ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    // タイトル描画
    const opTitleFont = `${canvasElement.height * 0.08}px Meiryo, Arial, sans-serif`;
    const opTitleColor = 'white';
    const opTitleMaxWidth = canvasElement.width * 0.8;
    const opTitleLineHeight = canvasElement.height * 0.1;
    wrapText(ctx, opening.title, 0, canvasElement.height * 0.45, opTitleMaxWidth, opTitleLineHeight, opTitleFont, opTitleColor, 'center');


    if (opening.audioText) {
      try {
        await speakText(opening.audioText, voice);
      } catch (speechError) { // speakTextがrejectした場合のエラーはここでキャッチされない（resolveするため）
        console.error("オープニング音声の読み上げ処理で問題が発生しました (speakText自体はresolve):", speechError);
        // speakTextがエラーでもresolveするので、duration待機は常に実行される
        await new Promise(resolve => setTimeout(resolve, opening.duration || 3000));
      }
    } else {
        await new Promise(resolve => setTimeout(resolve, opening.duration || 3000));
    }
  }

  // --- ニュースアイテムシーン ---
  for (const item of newsItems) {
    console.log(`シーンを生成中: ${item.title}`);
    // 背景描画
    if (item.backgroundImage) {
      try {
        const bgImg = await loadImage(item.backgroundImage);
        ctx.drawImage(bgImg, 0, 0, canvasElement.width, canvasElement.height);
      } catch (e) {
        console.warn(`背景画像 (${item.backgroundImage}) の読み込みに失敗。デフォルト背景を使用します。`, e);
        ctx.fillStyle = item.backgroundColor || 'white';
        ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
      }
    } else {
      ctx.fillStyle = item.backgroundColor || 'white';
      ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    // ニュース画像描画 (オプション)
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
    
    // テキスト描画 (タイトル)
    const titleFont = `${canvasElement.height * 0.06}px Meiryo, Arial, sans-serif`;
    const titleColor = item.backgroundColor && (item.backgroundColor.toLowerCase() === 'black' || item.backgroundColor.toLowerCase() === '#000000' || item.backgroundColor.toLowerCase().startsWith('rgb(0,0,0') || item.backgroundColor.toLowerCase().startsWith('rgba(0,0,0')) ? 'white' : 'black';
    const titleMaxWidth = canvasElement.width * 0.9;
    const titleLineHeight = canvasElement.height * 0.07;
    const titleY = item.imageUrl ? canvasElement.height * 0.7 : canvasElement.height * 0.45;

    wrapText(ctx, item.title, 0, titleY, titleMaxWidth, titleLineHeight, titleFont, titleColor, 'center');

    // 音声読み上げと表示時間
    const audioToSpeak = item.audioText || item.title;
    const slideDuration = item.slideDuration || defaultSlideDuration;

    try {
      await speakText(audioToSpeak, voice);
      // speakTextがエラーでもresolveするので、この待機は実行される
      await new Promise(resolve => setTimeout(resolve, Math.max(1000, slideDuration / 3) )); // 読み上げ後少し待つ
    } catch (speechError) { // speakTextがrejectした場合のエラーはここでキャッチされない（resolveするため）
      console.error(`「${item.title}」の音声読み上げ処理で問題が発生しました (speakText自体はresolve):`, speechError);
      // エラーでも指定時間待機
      await new Promise(resolve => setTimeout(resolve, slideDuration));
    }
  }

  recorder.stop();
  console.log("動画生成処理を停止しました。");
}
