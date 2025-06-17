// c/homepages/news_video_generator.js

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
function wrapText(context, text, x, y, maxWidth, lineHeight, font, color = 'black', textAlign = 'left') {
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
 * ヘッドライン一覧をCanvasに描画する関数
 * @param {CanvasRenderingContext2D} ctx Canvasの2Dコンテキスト
 * @param {Array<Object>} allNewsItems 全ニュースアイテムの配列
 * @param {number} currentIndex 現在のニュースアイテムのインデックス
 * @param {number} canvasWidth Canvasの幅
 * @param {number} canvasHeight Canvasの高さ
 */
function drawHeadlines(ctx, allNewsItems, currentIndex, canvasWidth, canvasHeight) {
    const headlineFontSize = canvasHeight * 0.025; // サイズを小さく
    const headlineFont = `${headlineFontSize}px Meiryo, Arial, sans-serif`;
    const lineHeight = canvasHeight * 0.03; // フォントサイズに合わせて調整
    let startY = canvasHeight * 0.08; // 少し下に
    const paddingX = canvasWidth * 0.02;
    const maxHeadlineWidth = canvasWidth - (paddingX * 2);

    ctx.fillStyle = 'black'; //「ヘッドライン一覧」の文字色
    // 「ヘッドライン一覧:」テキストのフォントサイズも headlineFont に合わせるか、別途定義
    const listTitleFont = `${canvasHeight * 0.03}px Meiryo, Arial, sans-serif`; // 少し大きめでも良い
    ctx.font = listTitleFont;
    ctx.fillText("ヘッドライン一覧:", paddingX, startY - lineHeight * 0.5); // 位置調整
    startY += lineHeight; // 「ヘッドライン一覧:」の下からのマージンを確保

    ctx.font = headlineFont; // 個々のヘッドラインのフォント設定

    allNewsItems.slice(0, 5).forEach((news, index) => { // 表示するヘッドライン数を制限 (例: 5件)
        let title = news.originalTitle || news.title; // 強調表示には翻訳前のタイトルを使うか、翻訳後を使うか選択。ここでは翻訳前を優先
        // 1行に収まるように省略処理を強化 (measureTextの前にフォント設定が必要)
        if (ctx.measureText(title).width > maxHeadlineWidth) { 
            let tempTitle = title;
            while (ctx.measureText(tempTitle + "...").width > maxHeadlineWidth && tempTitle.length > 0) {
                tempTitle = tempTitle.slice(0, -1);
            }
            title = tempTitle + "...";
        }
        ctx.fillStyle = (index === currentIndex) ? '#007bff' : 'black'; // 現在のアイテムを強調、他は黒
        ctx.fillText((index === currentIndex ? '▶ ' : '') + title, paddingX, startY + (index * lineHeight));
    });
}

/**
 * ニュースアイテムから動画を生成するメイン関数
 * @param {Array<Object>} newsItems ニュースアイテムの配列
 * @param {HTMLCanvasElement} canvasElement 動画フレームを描画するCanvas要素
 * @param {HTMLElement} outputContainer 生成された動画プレイヤーとリンクを表示するコンテナ
 * @param {Object} options 動画生成オプション
 */
async function generateVideoFromNews(newsItems, canvasElement, outputContainer, options = {}) {
  console.log('[VideoGen] ENTERING generateVideoFromNews function. Options:', options);
  const ctx = canvasElement.getContext('2d');
  // 動画生成時にcanvasを非表示にする
  canvasElement.style.display = 'none';

  console.log('[VideoGen] Received options:', JSON.parse(JSON.stringify(options, (key, value) => key === 'voice' && value instanceof SpeechSynthesisVoice ? {name: value.name, lang: value.lang} : value)));
  
  let mainTitleBgLoadedImg = null;
  if (options.mainTitleBackgroundImage) {
      try {
          mainTitleBgLoadedImg = await loadImage(options.mainTitleBackgroundImage);
          console.log(`[VideoGen] Main title background image "${options.mainTitleBackgroundImage}" loaded successfully.`);
      } catch (e) {
          console.warn(`[VideoGen] Failed to load main title background image "${options.mainTitleBackgroundImage}". Error: ${e.message}`, e);
      }
  }

  const { opening, defaultSlideDuration = 7000 } = options;

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
        const opTitleFont = `${canvasElement.height * 0.08}px Meiryo, Arial, sans-serif`; // フォントサイズは維持
        const opTitleColor = opening.titleColor || 'black'; // デフォルト色を黒に
        const opTitleMaxWidth = canvasElement.width * 0.8;
        const opTitleLineHeight = canvasElement.height * 0.1;
        wrapText(ctx, opening.title, 0, canvasElement.height * 0.45, opTitleMaxWidth, opTitleLineHeight, opTitleFont, opTitleColor, 'center');
    }

    // オープニングの表示時間
    const openingDuration = (opening && opening.duration) ? opening.duration : (opening && opening.backgroundVideo ? 0 : 3000); // 動画がない場合はデフォルト3秒
    await new Promise(resolve => setTimeout(resolve, openingDuration));
  }

  // --- ニュースアイテムシーン ---
  for (let i = 0; i < newsItems.length; i++) {
    const item = newsItems[i];
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

    // メインテロップの背景画像を描画 (item.title がある場合のみ)
    if (mainTitleBgLoadedImg && item.title) {
        try {
            const img = mainTitleBgLoadedImg;
            // Define ticker tape height and Y coordinate
            const tickerTapeHeight = canvasElement.height * 0.15;
            // Position the ticker tape at the bottom of the screen
            const tickerTapeY = canvasElement.height - tickerTapeHeight;
            // 画像をテロップ帯の領域いっぱいに描画（アスペクト比は無視して引き伸ばし）
            ctx.drawImage(img, 0, tickerTapeY, canvasElement.width, tickerTapeHeight);
            console.log(`[VideoGen] Item Scene: Main title background drawn for "${item.title.substring(0,50)}".`);
        } catch (e) {
            console.warn(`[VideoGen] Item Scene: Failed to draw main title background for "${item.title.substring(0,50)}". Error: ${e.message}`, e);
        }
    }


    // ヘッドライン一覧を描画 (背景描画後、メインタイトル描画前)
    drawHeadlines(ctx, newsItems, i, canvasElement.width, canvasElement.height);

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
        // 画像読み込み失敗時、またはimageUrlがない場合にプレースホルダーテキストを描画
        const placeholderText = "[タイトル画像]";
        const placeholderFont = `${canvasElement.height * 0.04}px Meiryo, Arial, sans-serif`;
        // このcatchブロックはloadImageがrejectされた場合にのみ実行される
        ctx.font = placeholderFont;
        ctx.fillStyle = 'grey';
        ctx.textAlign = 'center';
        ctx.fillText(placeholderText, canvasElement.width / 2, canvasElement.height * 0.4);
        console.error("ニュース画像の読み込みに失敗しました:", item.imageUrl, error);
      }
    }
    else { // item.imageUrl が元々ない場合
        const placeholderText = "[タイトル画像]";
        const placeholderFont = `${canvasElement.height * 0.04}px Meiryo, Arial, sans-serif`;
        ctx.font = placeholderFont;
        ctx.fillStyle = 'grey';
        ctx.textAlign = 'center';
        ctx.fillText(placeholderText, canvasElement.width / 2, canvasElement.height * 0.4);
    }
    
    const titleFont = `${canvasElement.height * 0.06}px Meiryo, Arial, sans-serif`;
    const titleColor = 'black'; // メインテロップの文字色を黒に固定

    const titleMaxWidth = canvasElement.width * 0.9;
    const titleLineHeight = canvasElement.height * 0.07;

    // 見出しテロップをもう少し下に配置
    const tickerTapeHeight = canvasElement.height * 0.15; // テロップ帯の高さ
    // テキストがテロップ帯の垂直中央に来るように、描画の基準となるY座標を計算
    const titleCenterYInTicker = canvasElement.height - (tickerTapeHeight / 2);

    let displayTitle = item.title;
    ctx.font = titleFont; // measureText のためにフォントを設定
    // ニュースの要約テロップ (item.title) を1行に収まるように調整 (2行以上の場合は要約)
    if (ctx.measureText(displayTitle).width > titleMaxWidth) { // まず幅でチェック
        let tempTitle = displayTitle;
        while(ctx.measureText(tempTitle + "...").width > titleMaxWidth && tempTitle.length > 0) {
            tempTitle = tempTitle.slice(0, -1);
        }
        displayTitle = tempTitle + "...";
    }
    // 1行のテキストをテロップ帯の垂直中央に配置するためのベースラインY座標を計算
    const textMetrics = ctx.measureText("あ"); // 代表的な文字で高さを取得 (より正確には actualBoundingBoxAscent/Descent)
    const ascent = textMetrics.actualBoundingBoxAscent || titleLineHeight * 0.7; // フォールバック
    const descent = textMetrics.actualBoundingBoxDescent || titleLineHeight * 0.3; // フォールバック
    const singleLineTitleBaselineY = titleCenterYInTicker + ascent / 2 - descent / 2;

    wrapText(ctx, displayTitle, 0, singleLineTitleBaselineY, titleMaxWidth, titleLineHeight, titleFont, titleColor, 'center');

    const slideDuration = item.slideDuration || defaultSlideDuration;

    console.log(`[VideoGen] Item Scene: Displaying item "${item.title.substring(0,50)}" for ${slideDuration}ms.`);
    await new Promise(resolve => setTimeout(resolve, slideDuration));
  }

  recorder.stop();
  console.log("[VideoGen] Video generation process stopped. Recorder stopped.");
}
