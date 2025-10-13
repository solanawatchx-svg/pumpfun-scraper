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
// --- LIVE TOKENS ENDPOINT (Cleaned + Memory Cache) ---
// ===============================
const recentMints = new Set();
let mintHistory = []; // track last 1000 tokens

app.get("/live-tokens", async (req, res) => {
  try {
    const { data } = await axios.get(ENDPOINTS.scan, { timeout: 15000 });

    const tokens = Array.isArray(data)
      ? data
      : data.coins || data.data || [];

    // --- Filter out any duplicate tokens (already seen in last 1000) ---
    const freshTokens = tokens.filter(t => !recentMints.has(t.mint));

    // --- Update memory with these new tokens ---
    freshTokens.forEach(t => {
      recentMints.add(t.mint);
      mintHistory.push(t.mint);
    });

    // --- Keep only the last 1000 tokens in memory ---
    if (mintHistory.length > 1000) {
      const removeCount = mintHistory.length - 1000;
      const toRemove = mintHistory.splice(0, removeCount);
      toRemove.forEach(m => recentMints.delete(m));
    }

    // --- Map tokens for frontend ---
    const mappedTokens = freshTokens.map(t => ({
      coinMint: t.mint,
      name: t.name,
      ticker: t.symbol,
      imageUrl: t.image
        ? `https://api.solanawatchx.site/image-proxy?url=${encodeURIComponent(t.image)}`
        : null,
      marketCap: t.marketCapUsd,
      volume: t.usdVolume,
      twitter: t.twitter,
      telegram: t.telegram,
      website: t.website,
      creationTime: t.createdTimestamp
    }));

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
