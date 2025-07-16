const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * フォロー情報 (follows/{followerId}) が変更されたときに、
 * 関係するユーザーのフォロー数(followingCount)とフォロワー数(followerCount)を更新する。
 */
exports.updateFollowCounts = functions.region("asia-northeast1")
    .firestore.document("artifacts/{appId}/public/data/follows/{followerId}")
    .onWrite(async (change, context) => {
        const { appId, followerId } = context.params;
        const beforeData = change.before.data();
        const afterData = change.after.data();

        // 変更前後のフォローリストを取得
        const beforeFollowing = new Set(beforeData?.following || []);
        const afterFollowing = new Set(afterData?.following || []);

        const batch = db.batch();
        const increment = admin.firestore.FieldValue.increment(1);
        const decrement = admin.firestore.FieldValue.increment(-1);

        // ■ 新しくフォローされたユーザーの処理
        const addedFollows = [...afterFollowing].filter(id => !beforeFollowing.has(id));
        addedFollows.forEach(followedId => {
            // フォローした人(followerId)のfollowingCountを+1
            const followerRef = db.doc(`artifacts/${appId}/public/data/users/${followerId}`);
            batch.update(followerRef, { followingCount: increment });

            // フォローされた人(followedId)のfollowerCountを+1
            const followedUserRef = db.doc(`artifacts/${appId}/public/data/users/${followedId}`);
            batch.update(followedUserRef, { followerCount: increment });
        });

        // ■ フォロー解除されたユーザーの処理
        const removedFollows = [...beforeFollowing].filter(id => !afterFollowing.has(id));
        removedFollows.forEach(followedId => {
            // フォロー解除した人(followerId)のfollowingCountを-1
            const followerRef = db.doc(`artifacts/${appId}/public/data/users/${followerId}`);
            batch.update(followerRef, { followingCount: decrement });

            // フォロー解除された人(followedId)のfollowerCountを-1
            const followedUserRef = db.doc(`artifacts/${appId}/public/data/users/${followedId}`);
            batch.update(followedUserRef, { followerCount: decrement });
        });

        // バッチ処理を実行して、すべての更新を一度に適用
        try {
            await batch.commit();
            console.log(`Follow counts updated for follower: ${followerId}. Added: ${addedFollows.length}, Removed: ${removedFollows.length}`);
        } catch (error) {
            console.error(`Failed to update follow counts for follower: ${followerId}`, error);
        }
    });

/**
 * 1時間ごとに実行され、過去24時間の投稿から人気のハッシュタグを集計し、
 * トレンドとしてFirestoreに保存する。
 * この関数をデプロイすると、Cloud Schedulerにジョブが自動的に作成されます。
 * 初回デプロイ時には、プロジェクトでApp Engineアプリケーションを有効にする必要がある場合があります。
 */
exports.updateTrendingHashtags = functions.region("asia-northeast1")
    .pubsub.schedule("every 1 hours")
    .onRun(async (context) => {
        console.log("Trending hashtags aggregation started.");

        try {
            // 1. 集計対象の期間（過去24時間）を設定
            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            // 2. すべてのappIdを横断して、過去24時間以内の投稿を取得
            // collectionGroupを使うことで、サブコレクション内の全postsを検索対象にできる
            const postsSnapshot = await db.collectionGroup("posts")
                .where("timestamp", ">=", yesterday.toISOString())
                .get();

            if (postsSnapshot.empty) {
                console.log("No recent posts found. No trends to update.");
                return null;
            }

            // 3. ハッシュタグをカウント
            const hashtagCounts = {};
            postsSnapshot.forEach(doc => {
                const post = doc.data();
                // postにhashtagsフィールドがあり、それが配列の場合のみ処理
                if (post.hashtags && Array.isArray(post.hashtags)) {
                    post.hashtags.forEach(tag => {
                        // タグが空文字列でないことを確認
                        if (tag) {
                            hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
                        }
                    });
                }
            });

            // 4. カウント数で降順にソートし、上位10件を抽出
            const sortedHashtags = Object.entries(hashtagCounts)
                .sort(([, countA], [, countB]) => countB - countA)
                .slice(0, 10) // トレンドとして表示する上位10件
                .map(([hashtag, count]) => ({
                    hashtag: hashtag,
                    count: count,
                }));

            if (sortedHashtags.length === 0) {
                console.log("No hashtags found in recent posts.");
                return null;
            }

            // 5. 集計結果をFirestoreの 'trends/hashtags' ドキュメントに保存
            const trendsRef = db.collection("trends").doc("hashtags");
            await trendsRef.set({
                list: sortedHashtags,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log("Successfully updated trending hashtags:", sortedHashtags);
            return null;
        } catch (error) {
            console.error("Error updating trending hashtags:", error);
            return null; // エラーが発生しても関数を正常終了させる
        }
    });
