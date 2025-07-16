/**
 * Cloudflare Worker for proxying requests to OGP, RSS, and Gemini API.
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS Headers - Adjust origin for production
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Or your specific frontend domain
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Custom-Voicevox-Key', // Add any other headers your frontend might send
  };

  // Handle OPTIONS (preflight) requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (path.startsWith('/fetch-ogp-proxy')) {
      return await handleOgpProxy(request, corsHeaders);
    } else if (path.startsWith('/rss-proxy')) {
      return await handleRssProxy(request, corsHeaders);
    } else if (path.startsWith('/gemini-proxy')) {
      // Ensure GEMINI_API_KEY is set in your Worker's environment variables
      if (typeof GEMINI_API_KEY === 'undefined') {
        return new Response('Gemini API key not configured.', { status: 500, headers: corsHeaders });
      }
      return await handleGeminiProxy(request, GEMINI_API_KEY, corsHeaders);
    } else {
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
  } catch (error) {
    console.error(`Error in Worker: ${error.message}`, error.stack);
    return new Response(`Internal Server Error: ${error.message}`, { status: 500, headers: corsHeaders });
  }
}

/**
 * Proxies requests to fetch OGP (Open Graph Protocol) image data.
 * Expects a 'url' query parameter with the target page URL.
 */
async function handleOgpProxy(request, baseCorsHeaders) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing "url" query parameter.', { status: 400, headers: baseCorsHeaders });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        // It's good practice to set a User-Agent, some sites might block requests without one.
        'User-Agent': 'OGPFetcher-CloudflareWorker/1.0 (+https://yourdomain.com/botinfo)',
      }
    });
    // Forward the response from the target server, including its headers.
    // However, we need to ensure our CORS headers are also present.
    const newHeaders = new Headers(response.headers);
    Object.entries(baseCorsHeaders).forEach(([key, value]) => newHeaders.set(key, value));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    console.error(`OGP Proxy Error for ${targetUrl}: ${error.message}`);
    return new Response(`Failed to fetch OGP data: ${error.message}`, { status: 502, headers: baseCorsHeaders }); // 502 Bad Gateway
  }
}

/**
 * Proxies requests to fetch RSS feed data.
 * Expects a 'url' query parameter with the target RSS feed URL.
 */
async function handleRssProxy(request, baseCorsHeaders) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing "url" query parameter.', { status: 400, headers: baseCorsHeaders });
  }

  try {
    const response = await fetch(targetUrl);
    const newHeaders = new Headers(response.headers);
    Object.entries(baseCorsHeaders).forEach(([key, value]) => newHeaders.set(key, value));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    console.error(`RSS Proxy Error for ${targetUrl}: ${error.message}`);
    return new Response(`Failed to fetch RSS feed: ${error.message}`, { status: 502, headers: baseCorsHeaders });
  }
}

/**
 * Proxies requests to the Google Generative AI (Gemini) API.
 */
async function handleGeminiProxy(request, apiKey, baseCorsHeaders) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed. Only POST is supported for Gemini proxy.', { status: 405, headers: baseCorsHeaders });
  }

  const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

  try {
    const requestBody = await request.json(); // Assuming the client sends a JSON body

    const geminiResponse = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseBody = await geminiResponse.text(); // Get text first to handle potential errors better

    const newHeaders = new Headers(geminiResponse.headers);
    Object.entries(baseCorsHeaders).forEach(([key, value]) => newHeaders.set(key, value));
    newHeaders.set('Content-Type', 'application/json'); // Ensure content type is JSON

    if (!geminiResponse.ok) {
        console.error(`Gemini API Error: ${geminiResponse.status} ${geminiResponse.statusText}`, responseBody);
        return new Response(responseBody, { status: geminiResponse.status, statusText: geminiResponse.statusText, headers: newHeaders });
    }

    return new Response(responseBody, { status: 200, headers: newHeaders });
  } catch (error) {
    console.error(`Gemini Proxy Error: ${error.message}`);
    return new Response(`Error proxying to Gemini: ${error.message}`, { status: 500, headers: baseCorsHeaders });
  }
}