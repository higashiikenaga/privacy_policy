async function generateVideoFromNews(newsItems, canvasElement, outputContainer) {
  const ctx = canvasElement.getContext('2d');
  // canvasのサイズは事前にHTML/CSSで設定されているか、ここで設定
  // 例: canvasElement.width = 1280; canvasElement.height = 720;

  const stream = canvasElement.captureStream(30); // 30 FPS
  // video/webm;codecs=vp9 の方がH.264よりライセンスフリーで広くサポートされている
  // video/mp4;codecs=h264 はブラウザのサポート状況に注意
  const options = { mimeType: 'video/webm;codecs=vp9' };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    console.warn(`${options.mimeType} is not supported, falling back to default.`);
    delete options.mimeType;
  }
  const recorder = new MediaRecorder(stream, options);
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const videoURL = URL.createObjectURL(blob);

    const videoPlayer = document.createElement('video');
    videoPlayer.src = videoURL;
    videoPlayer.controls = true;
    videoPlayer.style.maxWidth = '100%';

    const downloadLink = document.createElement('a');
    downloadLink.href = videoURL;
    downloadLink.download = 'news_summary_video.webm';
    downloadLink.textContent = 'Download Video';
    downloadLink.style.display = 'block';
    downloadLink.style.marginTop = '10px'; // ダウンロードリンクの上に少しマージンを追加

    // outputContainer が指定されていればそこに追加し、なければ body に追加
    const targetElement = outputContainer || document.body;
    targetElement.appendChild(videoPlayer);
    targetElement.appendChild(downloadLink);

    if (outputContainer) {
        console.log("動画が指定されたコンテナに追加されました。");
    } else {
        console.log("動画が document.body に追加されました。");
    }

    // メモリ解放のため、不要になったBlob URLを解放することを推奨
    // (例: ダウンロード後やユーザーがページを離れる際、または動画要素が不要になった際など)
    // URL.revokeObjectURL(videoURL);
  };

  recorder.start();
  console.log("動画生成を開始しました。");

  for (const item of newsItems) {
    // Canvasをクリア
    ctx.fillStyle = 'white'; // 背景色
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    // テキスト描画
    ctx.fillStyle = 'black';
    ctx.font = `${canvasElement.height * 0.05}px Arial`; // Canvasサイズに応じたフォントサイズ
    wrapText(ctx, item.title, canvasElement.width * 0.05, canvasElement.height * 0.15, canvasElement.width * 0.9, canvasElement.height * 0.07);

    // 画像描画
    if (item.imageUrl) {
      try {
        const img = await loadImage(item.imageUrl);
        const imgMaxHeight = canvasElement.height * 0.6;
        const imgMaxWidth = canvasElement.width * 0.8;
        let drawWidth = img.width;
        let drawHeight = img.height;

        if (drawHeight > imgMaxHeight) {
          drawHeight = imgMaxHeight;
          drawWidth = img.width * (imgMaxHeight / img.height);
        }
        if (drawWidth > imgMaxWidth) {
          drawWidth = imgMaxWidth;
          drawHeight = img.height * (imgMaxWidth / img.width);
        }

        const x = (canvasElement.width - drawWidth) / 2;
        const y = canvasElement.height * 0.3; // タイトルの下に配置
        ctx.drawImage(img, x, y, drawWidth, drawHeight);
      } catch (error) {
        console.error("画像の読み込みに失敗しました:", item.imageUrl, error);
        ctx.fillStyle = 'red';
        ctx.fillText(`画像読込エラー`, canvasElement.width * 0.05, canvasElement.height * 0.5);
      }
    }

    // 各シーンの表示時間 (例: 5秒間このフレームを表示)
    // MediaRecorderはリアルタイムでキャプチャするため、
    // この待機時間中、Canvasの内容が録画され続ける。
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  recorder.stop();
  console.log("動画生成処理を停止しました。");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // CORS対応のサーバーからの画像の場合に必要
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`画像の読み込みに失敗しました: ${src} ${err.type || err}`));
    img.src = src;
  });
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
   const words = text.split(' ');
   let line = '';
   let currentY = y;

   for(let n = 0; n < words.length; n++) {
     const testLine = line + words[n] + ' ';
     const metrics = context.measureText(testLine);
     const testWidth = metrics.width;
     if (testWidth > maxWidth && n > 0) {
       context.fillText(line.trim(), x, currentY);
       line = words[n] + ' ';
       currentY += lineHeight;
     } else {
       line = testLine;
     }
   }
   context.fillText(line.trim(), x, currentY);
}

/*
  news.html での呼び出し例:

  1. HTMLにCanvas要素、トリガーボタン、出力用コンテナを配置:
  <canvas id="newsCanvas" style="border: 1px solid black;"></canvas>
  <button id="generateVideoButton">ニュース動画を生成</button>
  <div id="videoOutputArea"></div>

  2. このJSファイルを読み込む:
  <script src="news_video_generator.js"></script>

  3. ボタンクリックで関数を実行:
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const generateButton = document.getElementById('generateVideoButton');
      const newsCanvas = document.getElementById('newsCanvas');
      const videoOutputDiv = document.getElementById('videoOutputArea'); // 出力先コンテナを取得

      if (generateButton && newsCanvas && videoOutputDiv) {
        // Canvasのサイズを設定 (CSSでも可)
        newsCanvas.width = 854;  // 480p (16:9)
        newsCanvas.height = 480;

        generateButton.addEventListener('click', async () => {
          if (!newsCanvas.getContext) {
            alert("お使いのブラウザはCanvasをサポートしていません。");
            return;
          }
          if (typeof MediaRecorder === 'undefined') {
            alert("お使いのブラウザはMediaRecorder APIをサポートしていません。");
            return;
          }

          // ニュースデータを準備 (実際のデータソースから取得)
          const exampleNewsItems = [
            { title: "速報：驚きの技術革新が発表されました！未来の生活が変わるかもしれません。", imageUrl: "https://via.placeholder.com/400x225.png/007bff/ffffff?Text=News+1" },
            { title: "特集：ローカルグルメ探訪記。隠れた名店の味をレポートします。", imageUrl: "https://via.placeholder.com/400x225.png/28a745/ffffff?Text=News+2" },
            { title: "天気：週末は全国的にお出かけ日和となるでしょう。" } // 画像なしの例
          ];

          try {
            generateButton.disabled = true;
            generateButton.textContent = '生成中...';
            videoOutputDiv.innerHTML = ''; // 前回の出力をクリア
            // 第3引数に出力先コンテナを渡す
            await generateVideoFromNews(exampleNewsItems, newsCanvas, videoOutputDiv);
            // alert("動画の生成が完了しました。指定のエリアにプレイヤーとダウンロードリンクが表示されます。");
            // UIは関数内で追加されるので、ここではアラートは任意
          } catch (error) {
            console.error("動画生成中にエラーが発生しました:", error);
            alert("動画生成中にエラーが発生しました: " + error.message);
          } finally {
            generateButton.disabled = false;
            generateButton.textContent = 'ニュース動画を生成';
          }
        });
      }
    });
  </script>
*/
