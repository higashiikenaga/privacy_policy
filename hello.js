// functions/hello.js
export async function onRequest(context) {
  console.log("[HelloFunction] Request received! Hello, world!");
  return new Response("Hello from Cloudflare Functions!", { status: 200 });
}
