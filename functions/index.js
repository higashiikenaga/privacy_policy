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
