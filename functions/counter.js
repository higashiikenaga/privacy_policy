// src/counter.js (例)
export class Counter {
    constructor(state, env) {
        this.state = state;
    }

    async fetch(request) {
        // カウント操作のリクエストを処理
        let value = await this.state.storage.get("value") || 0;

        if (request.method === "PUT") {
            value++;
            await this.state.storage.put("value", value);
            return new Response(String(value));
        }
        // 他の操作 (例: DELETEでデクリメント)
    }
}
