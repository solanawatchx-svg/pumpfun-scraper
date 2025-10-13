const express = require("express");
const axios = require("axios");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

const ENDPOINTS = {
  scan: "https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=100&offset=0",
  //byMarketCap: "https://advanced-api-v2.pump.fun/coins/list?sortBy=marketCap&limit=100&offset=0",
  //graduated: "https://advanced-api-v2.pump.fun/coins/list?graduated=true&sortBy=creationTime&limit=100&offset=0"
};

// ===============================
// --- IMAGE PROXY ---
// ===============================
// Image proxy endpoint
app.get("/image-proxy", async (req, res) => {
  try {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing url param");

    const urlObj = new URL(targetUrl);

    // Prefer 'src' parameter if present
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
// --- LIVE TOKENS ENDPOINT (Clean + Accurate) ---
// ===============================
const recentMints = new Set();
let mintHistory = []; // track last 1000 tokens
const MAX_CACHE = 1000;

app.get("/live-tokens", async (req, res) => {
  try {
    const { data } = await axios.get(ENDPOINTS.scan, { timeout: 15000 });

    const tokens = Array.isArray(data)
      ? data
      : data.coins || [];

    // --- Dedupe using correct key: coinMint ---
    const freshTokens = tokens.filter(t => !recentMints.has(t.coinMint));

    // --- Update memory ---
    freshTokens.forEach(t => {
      recentMints.add(t.coinMint);
      mintHistory.push(t.coinMint);
    });

    // --- Keep memory light (max 1000 entries) ---
    if (mintHistory.length > MAX_CACHE) {
      const overflow = mintHistory.splice(0, mintHistory.length - MAX_CACHE);
      overflow.forEach(m => recentMints.delete(m));
    }

    // --- Map clean response for frontend ---
    const mappedTokens = freshTokens.map(t => ({
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
      creationTime: t.creationTime
    }));

    // --- Sort by creation time descending (newest first) ---
    mappedTokens.sort((a, b) => b.creationTime - a.creationTime);

    console.log(`🆕 Sent ${mappedTokens.length} new tokens, cache size = ${recentMints.size}`);

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
