const express = require("express");
const axios = require("axios");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

const ENDPOINTS = {
  scan: "https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=100&offset=0",
  byMarketCap: "https://advanced-api-v2.pump.fun/coins/list?sortBy=marketCap&limit=100&offset=0",
  graduated: "https://advanced-api-v2.pump.fun/coins/list?graduated=true&sortBy=creationTime&limit=100&offset=0"
};

// ===============================
// --- IMAGE PROXY ---
// ===============================
app.get("/image-proxy", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing url param");

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });

    const contentType = response.headers.get("content-type") || "image/png";
    res.set("Content-Type", contentType);
    response.body.pipe(res);
  } catch (err) {
    console.error("❌ Image proxy error:", err.message);
    res.status(500).send("Image proxy failed");
  }
});

// ===============================
// --- LIVE TOKENS ENDPOINT ---
// ===============================
app.get("/live-tokens", async (req, res) => {
  try {
    const { data } = await axios.get(ENDPOINTS.scan, { timeout: 15000 });
    const tokens = Array.isArray(data) ? data : data.coins || data.data || [];

    // Rewrite image URLs to go through proxy
    const mappedTokens = tokens.map(t => ({
      ...t,
      imageUrl: t.imageUrl
        ? `https://api.solanawatchx.site/image-proxy?url=${encodeURIComponent(t.imageUrl)}`
        : null
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
