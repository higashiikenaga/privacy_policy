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
 * 指定されたURLからOGP画像のURLを取得する非同期関数
 * @param {string} url ニュース記事のURL
 * @returns {Promise<string|null>} OGP画像のURL、または見つからない場合はnull
 * @note クライアントサイドでの外部サイトへのfetchはCORSポリシーにより失敗する可能性があります。
 *       安定した動作のためにはサーバーサイドでOGP情報を取得するAPIエンドポイントの利用を推奨します。
 */
async function fetchOgpImageUrl(url) {
  if (!url) return null;
  try {
    // 注意: このfetchはCORSエラーで失敗する可能性が高いです。
    // 実際にはサーバーサイドプロキシ等を経由してHTMLを取得する必要があります。
    const response = await fetch(url, { mode: 'cors' }); // mode: 'cors' を明示
    if (!response.ok) {
      console.warn(`[fetchOgpImageUrl] Failed to fetch HTML from ${url}. Status: ${response.status}`);
      return null;
    }
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const ogImageMeta = doc.querySelector('meta[property="og:image"]');
    if (ogImageMeta && ogImageMeta.content) {
      console.log(`[fetchOgpImageUrl] Found OGP image for ${url}: ${ogImageMeta.content}`);
      return new URL(ogImageMeta.content, url).href; // 絶対URLに変換
    }
    console.log(`[fetchOgpImageUrl] OGP image meta tag not found for ${url}.`);
    return null;
  } catch (error) {
    console.error(`[fetchOgpImageUrl] Error fetching or parsing OGP image for ${url}:`, error);
    return null;
  }
}

/**
 * Canvasにテキストを折り返して描画する関数
 */
function wrapText(context, text, x, y, maxWidth, lineHeight, font, color = 'black', textAlign = 'left') {
  context.font = font || `'Noto Sans JP', Arial, sans-serif`; // フォント指定がない場合のデフォルトを追加
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
    ctx.textAlign = 'left'; // テキストアラインメントを左揃えに明示的に設定
    const headlineFontSize = canvasHeight * 0.045; // フォントサイズを調整 (例: 0.025 -> 0.035)
    const headlineFont = `${headlineFontSize}px 'Noto Sans JP', Arial, sans-serif`;
    const lineHeight = canvasHeight * 0.04; // フォントサイズに合わせて行間を調整 (例: 0.03 -> 0.04)
    const paddingX = canvasWidth * 0.1; // 左パディングを増やす (0.03 から 0.05 へ)
    let startY = canvasHeight * 0.08; 
    const maxHeadlineWidth = canvasWidth - (paddingX * 2); // 最大幅もパディングに合わせて調整 (右パディングも考慮)

    ctx.fillStyle = 'black'; //「ヘッドライン一覧」の文字色
    const listTitleFont = `${canvasHeight * 0.03}px 'Noto Sans JP', Arial, sans-serif`;
    ctx.font = listTitleFont;
    ctx.fillText("ヘッドライン一覧:", paddingX, startY - lineHeight * 0.5); // 描画開始位置をpaddingXに合わせる
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

  // 動画解説ニュースを除外する処理 (item.isVideoNews を使用)
  const filteredNewsItems = newsItems.filter(item => {
    if (item.isVideoNews === true) {
      console.log(`[VideoGen] Excluding video news item: "${item.title}" (URL: ${item.link || 'N/A'})`);
      return false; // 除外
    }
    return true; // 保持
  });

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

  // エンディングシーン用のデフォルト背景画像を事前にロード
  let endingBgLoadedImg = null;
  const defaultEndingBackgroundImagePath = 'back.png'; // デフォルトの背景画像パス
  try {
      endingBgLoadedImg = await loadImage(defaultEndingBackgroundImagePath);
      console.log(`[VideoGen] Ending background image "${defaultEndingBackgroundImagePath}" loaded successfully.`);
  } catch (e) {
      console.warn(`[VideoGen] Failed to load default ending background image "${defaultEndingBackgroundImagePath}". Error: ${e.message}`, e);
  }

  // --- オープニングシーン ---
  if (opening && (opening.title || opening.backgroundVideo)) { // タイトルまたは背景動画があればオープニング処理
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
        const opDuration = (video.duration && video.duration > 0 && isFinite(video.duration)) ? video.duration * 1000 : (opening.duration || 5000); // video.duration (秒) をミリ秒に変換、フォールバックあり

        while (opElapsedTime < opDuration && !video.ended) {
          // console.log(`[VideoGen] Opening: Drawing video frame. Elapsed: ${opElapsedTime}, Video currentTime: ${video.currentTime}`);
          ctx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
          if (opening.title) { // タイトルがある場合のみ描画
            const opTitleFont = `${canvasElement.height * 0.08}px 'Noto Sans JP', Arial, sans-serif`;
            const opTitleColor = opening.titleColor || 'white'; // 動画の上なので白が良いことが多い
            const opTitleMaxWidth = canvasElement.width * 0.8;
            const opTitleLineHeight = canvasElement.height * 0.09;
            wrapText(ctx, opening.title, 0, canvasElement.height * 0.45, opTitleMaxWidth, opTitleLineHeight, opTitleFont, opTitleColor, 'center');
          }
          
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

    // タイトル描画 (動画背景が使用されなかった場合で、かつタイトルが指定されている場合)
    // 動画背景の場合はループ内で描画済みなので、ここでは動画背景でない場合のみタイトルを描画
    if (!opening.backgroundVideo && opening.title) {
        const opTitleFont = `${canvasElement.height * 0.08}px 'Noto Sans JP', Arial, sans-serif`;
        // 背景画像が成功していれば白、そうでなければ黒をデフォルトの文字色とする
        const opTitleColor = opening.titleColor || (opRenderedSuccessfully ? 'white' : 'black');
        const opTitleMaxWidth = canvasElement.width * 0.8;
        const opTitleLineHeight = canvasElement.height * 0.09;
        wrapText(ctx, opening.title, 0, canvasElement.height * 0.45, opTitleMaxWidth, opTitleLineHeight, opTitleFont, opTitleColor, 'center');
    }

    // オープニングの表示時間
    // 動画がある場合は動画の再生時間で制御されるため、ここでの追加待機は不要
    // 動画がなく、静止画または背景色のみの場合は指定されたdurationまたはデフォルト時間待機
    if (!opening.backgroundVideo) {
        const staticOpeningDuration = (opening && typeof opening.duration === 'number') ? opening.duration : 3000; // デフォルト3秒
        if (staticOpeningDuration > 0) await new Promise(resolve => setTimeout(resolve, staticOpeningDuration));
    }
  }

  // --- ニュースアイテムシーン ---
  for (let i = 0; i < filteredNewsItems.length; i++) {
    const item = filteredNewsItems[i];
    console.log(`[VideoGen] Item Scene: Starting generation for item ${i + 1}: "${item.title.substring(0,50)}..."`);

    // このアイテムで使用する背景画像とニュース画像を事前にロード/準備
    let itemBackgroundImageElement = null;
    if (item.backgroundImage) {
        try {
            console.log(`[VideoGen] Item Scene: Attempting to load item.backgroundImage "${item.backgroundImage}" for "${item.title.substring(0,50)}..."`);
            itemBackgroundImageElement = await loadImage(item.backgroundImage);
            console.log(`[VideoGen] Item Scene: Successfully loaded item.backgroundImage for "${item.title.substring(0,50)}".`);
        } catch (e) {
            console.warn(`[VideoGen] Item Scene: Failed to load item.backgroundImage "${item.backgroundImage}" for "${item.title.substring(0,50)}". Error: ${e.message}`);
        }
    }

    let itemNewsImageElement = null;
    let newsImageDrawParams = null;

    let newsImageUrlToLoad = item.imageUrl;

    // デバッグログ: 画像URL選択前の item の状態を確認
    console.log(`[VideoGen] Debug Img Select: Item: "${item.title.substring(0,30)}...", imageUrl: "${item.imageUrl}", ogpImageUrl: "${item.ogpImageUrl}", link: "${item.link}"`);

    if (!newsImageUrlToLoad && item.ogpImageUrl) {
        // item.imageUrl がなく、item.ogpImageUrl が事前に設定されていればそれを使用
        console.log(`[VideoGen] Item Scene: item.imageUrl not found for "${item.title.substring(0,50)}...". Using pre-fetched OGP image from item.ogpImageUrl: ${item.ogpImageUrl}`);
        newsImageUrlToLoad = item.ogpImageUrl;
    } else if (!newsImageUrlToLoad && item.link) {
        // item.imageUrl も item.ogpImageUrl もない場合、item.link から OGP 画像取得を試みる
        console.log(`[VideoGen] Item Scene: No primary image or pre-fetched OGP image for "${item.title.substring(0,50)}...". Attempting to fetch OGP image dynamically from link: ${item.link}`);
        try {
            const dynamicallyFetchedOgpImage = await fetchOgpImageUrl(item.link);
            if (dynamicallyFetchedOgpImage) {
                newsImageUrlToLoad = dynamicallyFetchedOgpImage;
                console.log(`[VideoGen] Item Scene: Successfully fetched OGP image dynamically: "${newsImageUrlToLoad}" for "${item.title.substring(0,50)}..."`);
            } else {
                console.log(`[VideoGen] Item Scene: Failed to fetch OGP image dynamically from link for "${item.title.substring(0,50)}...". No news image will be loaded.`);
            }
        } catch (e) {
            console.warn(`[VideoGen] Item Scene: Error during dynamic OGP image fetching for "${item.title.substring(0,50)}...": ${e.message}`);
        }
    } else if (!newsImageUrlToLoad) {
        // item.imageUrl も item.ogpImageUrl もなく、item.link もない (またはOGP取得に失敗した) 場合
        console.log(`[VideoGen] Item Scene: No primary image (item.imageUrl) or OGP image (item.ogpImageUrl) found for "${item.title.substring(0,50)}...". No news image will be loaded.`);
    }

    if (newsImageUrlToLoad) {
        try {
            console.log(`[VideoGen] Item Scene: Attempting to load news image (URL: "${newsImageUrlToLoad}") for "${item.title.substring(0,50)}..."`);
            itemNewsImageElement = await loadImage(newsImageUrlToLoad);
            console.log(`[VideoGen] Item Scene: Successfully loaded news image (URL: "${newsImageUrlToLoad}") for "${item.title.substring(0,50)}".`);
            // 描画サイズ計算 (「二回り小さく」するためスケールファクターを調整)
            const scaleFactor = 0.25; // 元は0.4。値を小さくして「二回り小さく」を表現
            const imgMaxHeight = canvasElement.height * 0.5 * scaleFactor;
            const imgMaxWidth = canvasElement.width * 0.7 * scaleFactor;
            let drawWidth = itemNewsImageElement.width;
            let drawHeight = itemNewsImageElement.height;
            const aspectRatio = itemNewsImageElement.width / itemNewsImageElement.height;
            if (drawHeight > imgMaxHeight) { drawHeight = imgMaxHeight; drawWidth = drawHeight * aspectRatio; }
            if (drawWidth > imgMaxWidth) { drawWidth = imgMaxWidth; drawHeight = drawWidth / aspectRatio; }
            const x = (canvasElement.width - drawWidth) / 2;
            const y = canvasElement.height * 0.15; // 垂直方向の位置は既存のまま (画面上部15%)
            newsImageDrawParams = { img: itemNewsImageElement, x, y, width: drawWidth, height: drawHeight };
            console.log(`[VideoGen] Item Scene: newsImageDrawParams SET for "${item.title.substring(0,50)}":`, JSON.stringify(newsImageDrawParams, (k,v) => v instanceof HTMLImageElement ? {src: v.src, width: v.width, height: v.height, complete: v.complete, naturalWidth: v.naturalWidth } : v));
        } catch (error) {
            console.error(`[VideoGen] Item Scene: Failed to load news image (item.imageUrl: ${item.imageUrl}). Error:`, error);
        }
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

    // 字幕として表示するテキストの配列を準備
    // item.summarySentences が配列で、各要素が1文の文字列であることを期待
    const subtitles = (item.summarySentences && Array.isArray(item.summarySentences) && item.summarySentences.length > 0)
        ? item.summarySentences
        : [item.title]; // 要約がない場合はタイトルを字幕として扱う

    const numSubtitles = subtitles.length;
    const totalItemDuration = item.slideDuration || defaultSlideDuration;
    const durationPerSubtitle = totalItemDuration / numSubtitles;

    const animationDuration = 500; // ms, フェードイン/アウトそれぞれのアニメーション時間
    const fps = 30;
    const frameDuration = 1000 / fps;

    for (let subtitleIndex = 0; subtitleIndex < subtitles.length; subtitleIndex++) {
        const subtitleText = subtitles[subtitleIndex];
        // 1. 背景描画 (itemBackgroundImageElement またはデフォルト色)
        if (itemBackgroundImageElement) {
            ctx.drawImage(itemBackgroundImageElement, 0, 0, canvasElement.width, canvasElement.height);
        } else {
            // item.backgroundImage がない場合は、item.backgroundColor を使用
            ctx.fillStyle = item.backgroundColor || 'white'; // デフォルトは白
            ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        }

        // 2. メインテロップの背景画像 (mainTitleBgLoadedImg) - 字幕表示エリアの背景
        if (mainTitleBgLoadedImg) {
            const tickerTapeHeight = canvasElement.height * 0.15;
            const tickerTapeY = canvasElement.height - tickerTapeHeight;
            ctx.drawImage(mainTitleBgLoadedImg, 0, tickerTapeY, canvasElement.width, tickerTapeHeight);
        }

        // 3. ヘッドライン一覧描画
        drawHeadlines(ctx, filteredNewsItems, i, canvasElement.width, canvasElement.height);

        // 4. ニュース画像描画 (itemNewsImageElement またはプレースホルダー)
        if (newsImageDrawParams) {
            ctx.drawImage(newsImageDrawParams.img, newsImageDrawParams.x, newsImageDrawParams.y, newsImageDrawParams.width, newsImageDrawParams.height);
        } else { // ニュース画像がないか、ロード失敗した場合
            const placeholderText = "";
            const placeholderFont = `${canvasElement.height * 0.04}px 'Noto Sans JP', Arial, sans-serif`;
            ctx.font = placeholderFont;
            ctx.fillStyle = 'grey';
            ctx.textAlign = 'center';
            ctx.fillText(placeholderText, canvasElement.width / 2, canvasElement.height * 0.4);
            // ctx.textAlign = 'left'; // wrapText内でtextAlignは設定・リセットされるので、ここでは不要かも
        }

        // 5. 現在の字幕 (subtitleText) を描画
        const subtitleFont = `${canvasElement.height * 0.055}px 'Noto Sans JP', Arial, sans-serif`; // Noto Sans JPは若干大きめに見えることがあるので微調整
        const subtitleColor = 'black';
        const subtitleMaxWidth = canvasElement.width * 0.9;
        const subtitleLineHeight = canvasElement.height * 0.065; // フォントサイズに合わせて調整
        const tickerTapeHeightVal = canvasElement.height * 0.15; // テロップ帯の高さ
        const subtitleCenterYInTicker = canvasElement.height - (tickerTapeHeightVal / 2); // テロップ帯の垂直中心

        let displaySubtitle = subtitleText;
        ctx.font = subtitleFont; // measureText の前にフォントを設定
        // 字幕が1行に収まるように調整 (2行以上の場合は末尾に...)
        if (ctx.measureText(displaySubtitle).width > subtitleMaxWidth) {
            let tempSubtitle = displaySubtitle;
            while(ctx.measureText(tempSubtitle + "...").width > subtitleMaxWidth && tempSubtitle.length > 0) {
                tempSubtitle = tempSubtitle.slice(0, -1);
            }
            displaySubtitle = tempSubtitle + "...";
        }
        
        // 1行のテキストをテロップ帯の垂直中央に配置するためのベースラインY座標を計算
        const textMetricsSub = ctx.measureText("あ"); // アセント・ディセント取得用 (日本語文字が良い)
        const ascentSub = textMetricsSub.actualBoundingBoxAscent || subtitleLineHeight * 0.7; // フォールバック
        const descentSub = textMetricsSub.actualBoundingBoxDescent || subtitleLineHeight * 0.3; // フォールバック
        // ベースラインY = 中心Y + (アセント/2) - (ディセント/2) (おおよその中央揃え)
        // wrapTextはYをベースラインとして受け取るので、これで良いはず
        const singleLineSubtitleBaselineY = subtitleCenterYInTicker + (ascentSub - descentSub) / 2;

        const subtitleStayDuration = Math.max(0, durationPerSubtitle - 2 * animationDuration);
        const subtitleMetrics = ctx.measureText(displaySubtitle); // 事前に幅を取得
        const subtitleActualWidth = subtitleMetrics.width;

        // アニメーションループ
        let elapsed = 0;
        while (elapsed < durationPerSubtitle) {
            // --- 再描画処理 (各フレーム共通) ---
            if (itemBackgroundImageElement) {
                ctx.drawImage(itemBackgroundImageElement, 0, 0, canvasElement.width, canvasElement.height);
            } else {
                ctx.fillStyle = item.backgroundColor || 'white';
                ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
            }
            if (mainTitleBgLoadedImg) {
                const tickerTapeHeight = canvasElement.height * 0.15;
                const tickerTapeY = canvasElement.height - tickerTapeHeight;
                ctx.drawImage(mainTitleBgLoadedImg, 0, tickerTapeY, canvasElement.width, tickerTapeHeight);
            }
            drawHeadlines(ctx, filteredNewsItems, i, canvasElement.width, canvasElement.height);
            if (newsImageDrawParams) {
                console.log(`[VideoGen] Item Scene (Frame ${Math.round(elapsed/frameDuration)}): Drawing news image. Params:`, JSON.stringify(newsImageDrawParams, (k,v) => v instanceof HTMLImageElement ? {src: v.src, complete: v.complete} : v), `Actual img object:`, newsImageDrawParams.img);
                ctx.drawImage(newsImageDrawParams.img, newsImageDrawParams.x, newsImageDrawParams.y, newsImageDrawParams.width, newsImageDrawParams.height);
            } else {
                const placeholderText = "";
                const phFont = `${canvasElement.height * 0.04}px 'Noto Sans JP', Arial, sans-serif`;
                ctx.font = phFont; ctx.fillStyle = 'grey'; ctx.textAlign = 'center';
                ctx.fillText(placeholderText, canvasElement.width / 2, canvasElement.height * 0.4);
            }
            // --- ここまで再描画処理 ---

            ctx.save();

            let currentAlpha = 1.0;
            let offsetX = 0;
            const targetXForCenter = 0; // wrapTextが中央揃えするので、オフセットの基準は0

            if (elapsed < animationDuration) { // フェードイン
                const progress = elapsed / animationDuration;
                currentAlpha = progress; // 0 to 1
                // 右から登場: canvas.width/2 (画面右端中央) から targetXForCenter (画面中央) へ
                offsetX = (canvasElement.width / 2) * (1 - progress);
            } else if (elapsed < animationDuration + subtitleStayDuration) { // 表示中
                currentAlpha = 1.0;
                offsetX = targetXForCenter;
            } else { // フェードアウト (elapsed < durationPerSubtitle)
                const progress = (elapsed - (animationDuration + subtitleStayDuration)) / animationDuration;
                currentAlpha = 1.0 - progress; // 1 to 0
                // 左へ退場: targetXForCenter (画面中央) から -canvas.width/2 - subtitleActualWidth/2 (画面左端外) へ
                offsetX = -(canvasElement.width / 2 + subtitleActualWidth / 2) * progress;
            }

            ctx.globalAlpha = Math.max(0, Math.min(1, currentAlpha)); // 0-1の範囲に収める
            
            // wrapTextはtextAlign: 'center' の場合、canvas幅の中心を基準にする。
            // そのため、translateで描画位置をオフセットする。
            ctx.translate(offsetX, 0);
            wrapText(ctx, displaySubtitle, 0, singleLineSubtitleBaselineY, subtitleMaxWidth, subtitleLineHeight, subtitleFont, subtitleColor, 'center');
            
            ctx.restore();

            await new Promise(r => setTimeout(r, frameDuration));
            elapsed += frameDuration;
        }
        // Ensure the full durationPerSubtitle is waited for, even if animation frames don't perfectly align
        // This also ensures the last frame of fade-out is "held" if needed, though alpha should be 0.
        const remainingTime = durationPerSubtitle - elapsed;
        if (remainingTime > 0) {
            await new Promise(r => setTimeout(r, remainingTime));
        }
        console.log(`[VideoGen] Item Scene: Finished displaying subtitle "${displaySubtitle.substring(0,50)}"`);
    }
  }

  // --- エンディングシーン ---
  console.log("[VideoGen] Ending Scene: Starting generation...");
  // 背景を描画 (デフォルト背景画像または黒)
  if (endingBgLoadedImg) {
      ctx.drawImage(endingBgLoadedImg, 0, 0, canvasElement.width, canvasElement.height);
      console.log("[VideoGen] Ending Scene: Default background image drawn.");
  } else {
      ctx.fillStyle = 'black'; // 画像がロードできない場合は黒背景
      ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  }

  // 「終：newsAI」テロップを描画
  const endingText = "終：newsAI";
  const endingFont = `${canvasElement.height * 0.08}px 'Noto Sans JP', Arial, sans-serif`;
  const endingColor = 'black'; // 文字色を黒に変更
  const endingMaxWidth = canvasElement.width * 0.8;
  const endingLineHeight = canvasElement.height * 0.09;
  wrapText(ctx, endingText, 0, canvasElement.height * 0.45, endingMaxWidth, endingLineHeight, endingFont, endingColor, 'center');
  
  const endingDuration = 3000; // エンディングの表示時間 (3秒)
  await new Promise(resolve => setTimeout(resolve, endingDuration));
  console.log("[VideoGen] Ending Scene: Finished.");

  recorder.stop();
  console.log("[VideoGen] Video generation process stopped. Recorder stopped.");
}
