const express = require("express");
const axios = require("axios");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase configuration (using your provided URL and anon key)
const SUPABASE_URL = "https://dyferdlczmzxurlfrjnd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZmVyZGxjem16eHVybGZyam5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MjYxMDMsImV4cCI6MjA3NDIwMjEwM30.LTXkmO2MkqYqg4g7Bv7H8u1rgQnDnQ43FDaT7DzFAt8";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cache SOL price to avoid hitting CoinGecko too often
let cachedSolPrice = null;
let lastSolPriceFetch = 0;
const SOL_PRICE_CACHE_DURATION = 10 * 1000; // 10 seconds

const ENDPOINTS = {
  scan: "https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=100&offset=0",
  //byMarketCap: "https://advanced-api-v2.pump.fun/coins/list?sortBy=marketCap&limit=100&offset=0",
  //graduated: "https://advanced-api-v2.pump.fun/coins/list?graduated=true&sortBy=creationTime&limit=100&offset=0"
};

// Store the coinMints of the last batch sent to the frontend (in memory)
let lastBatchCoinMints = new Set();

// ===============================
// --- IMAGE PROXY ---
// ===============================
// (Unchanged)
app.get("/image-proxy", async (req, res) => {
  try {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing url param");

    const urlObj = new URL(targetUrl);

    if (urlObj.searchParams.get("src")) {
      targetUrl = urlObj.searchParams.get("src");
    } else if (urlObj.searchParams.get("ipfs")) {
      const ipfsHash = urlObj.searchParams.get("ipfs");
      targetUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
    }

    const response = await fetch(targetUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    if (!response.ok) return res.status(500).send("Failed to fetch image");

    const contentType = response.headers.get("content-type") || "image/png";
    res.set("Content-Type", contentType);
    response.body.pipe(res);
  } catch (err) {
    console.error("Image proxy error:", err.message);
    res.status(500).send("Image proxy failed");
  }
});

// ===============================
// --- SOL-PRICE ENDPOINT ---
// ===============================
// (Unchanged - fetches and caches SOL price)
app.get("/sol-price", async (req, res) => {
  try {
    if (cachedSolPrice && Date.now() - lastSolPriceFetch < SOL_PRICE_CACHE_DURATION) {
      return res.json({ solana_usd: cachedSolPrice });
    }

    const { data } = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { timeout: 5000 });
    cachedSolPrice = data.solana.usd;
    lastSolPriceFetch = Date.now();
    res.json({ solana_usd: cachedSolPrice });
  } catch (err) {
    console.error("❌ Error fetching SOL price:", err.message);
    res.status(500).json({ error: "Failed to fetch SOL price" });
  }
});

// ===============================
// --- LIVE TOKENS ENDPOINT ---
// ===============================
app.get("/live-tokens", async (req, res) => {
  try {
    const { data } = await axios.get(ENDPOINTS.scan, { timeout: 15000 });
    const tokens = Array.isArray(data) ? data : data.coins || data.data || [];

    // Remove duplicate tokens by address
    const seenAddresses = new Set();
    const uniqueTokens = [];
    for (const t of tokens) {
      if (t.coinMint && !seenAddresses.has(t.coinMint)) {
        seenAddresses.add(t.coinMint);
        uniqueTokens.push(t);
      }
    }

    // Sort tokens by creationTime (newest first)
    uniqueTokens.sort((a, b) => b.creationTime - a.creationTime);

    // Calculate liquidity for each token (exact formula from live-feed.js)
    uniqueTokens.forEach(t => {
      let liquidity_sol = 0;
      let dev_held = 0;
      for (const h of t.holders || []) {
        if (h.holderId === t.dev) {
          dev_held = h.totalTokenAmountHeld;
          break;
        }
      }
      if (dev_held > 0) {
        const TOKEN_DECIMALS = 6;
        const dev_token_units = BigInt(Math.floor(dev_held * Math.pow(10, TOKEN_DECIMALS)));
        const INITIAL_VIRTUAL_SOL = 30000000000n;
        const INITIAL_VIRTUAL_TOKEN = 1073000000000000n;
        const k = INITIAL_VIRTUAL_SOL * INITIAL_VIRTUAL_TOKEN;
        const new_virtual_token = INITIAL_VIRTUAL_TOKEN - dev_token_units;
        if (new_virtual_token > 0n) {
          const new_virtual_sol = k / new_virtual_token;
          const delta_lamports = new_virtual_sol - INITIAL_VIRTUAL_SOL;
          liquidity_sol = Number(delta_lamports) / 1e9;
        }
      }
      t.liquidity_sol = liquidity_sol;
      t.liquidity_usd = cachedSolPrice ? liquidity_sol * cachedSolPrice : 0;
    });

    // Filter out tokens already sent in the last batch
    const newTokens = uniqueTokens.filter(t => !lastBatchCoinMints.has(t.coinMint));

    // Save new tokens to Supabase (only if there are new ones)
    if (newTokens.length > 0) {
      const tokensToInsert = newTokens.map(t => ({
        coinMint: t.coinMint,
        name: t.name,
        ticker: t.ticker,
        imageUrl: t.imageUrl,
        marketCap: t.marketCap,
        volume: t.volume,
        twitter: t.twitter,
        telegram: t.telegram,
        website: t.website,
        creationTime: t.creationTime,
        liquidity_sol: t.liquidity_sol,
        liquidity_usd: t.liquidity_usd,
        dev: t.dev,
      }));
      const { error } = await supabase.from("tokens").insert(tokensToInsert);
      if (error) {
        console.error("❌ Supabase insert error:", error.message);
      } else {
        console.log(`✅ Saved ${newTokens.length} new tokens to Supabase`);
      }
    }

    // Rewrite image URLs to go through proxy and SELECT ONLY REQUIRED FIELDS
    const mappedTokens = newTokens.map(t => ({
      coinMint: t.coinMint,
      name: t.name,
      ticker: t.ticker,
      imageUrl: t.imageUrl
        ? `https://api.solanawatchx.site/image-proxy?url=${encodeURIComponent(t.imageUrl)}`
        : null,
      marketCap: t.marketCap,
      volume: t.volume,
      twitter: t.twitter,
      telegram: t.telegram,
      website: t.website,
      creationTime: t.creationTime,
      liquidity_usd: t.liquidity_usd  // NEW: Include the calculated liquidity value
    }));

    // Update lastBatchCoinMints to current batch's coinMints
    lastBatchCoinMints = new Set(uniqueTokens.map(t => t.coinMint));

    res.json({ tokens: mappedTokens });
  } catch (err) {
    console.error("❌ Error fetching live tokens:", err.message);
    res.status(500).json({ error: "Failed to fetch live tokens" });
  }
});

// ===============================
// --- START SERVER ---
// ===============================
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
