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
// Image proxy endpoint
app.get("/image-proxy", async (req, res) => {
  try {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing url param");

    // If it's an images.pump.fun URL, extract the actual source
    const urlObj = new URL(targetUrl);
    if (urlObj.hostname === "images.pump.fun") {
      const srcParam = urlObj.searchParams.get("src");
      if (srcParam) targetUrl = srcParam;
    }

    const response = await fetch(targetUrl, { redirect: "follow" });
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
