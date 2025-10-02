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

// ✅ Proxy endpoint to bypass CORS for images
app.get("/image-proxy", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing url param");

    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type");
    res.set("Content-Type", contentType);
    response.body.pipe(res);
  } catch (err) {
    res.status(500).send("Image proxy failed");
  }
});

// ✅ Live tokens endpoint
app.get("/live-tokens", async (req, res) => {
  try {
    const { data } = await axios.get(ENDPOINTS.scan, { timeout: 15000 });
    const tokens = Array.isArray(data) ? data : data.coins || data.data || [];

    // 🔥 Rewrite imageUrl to use proxy
    const mapped = tokens.map(t => ({
      ...t,
      imageUrl: t.imageUrl
        ? `https://api.solanawatchx.site/image-proxy?url=${encodeURIComponent(t.imageUrl)}`
        : null
    }));

    res.json({ tokens: mapped });
  } catch (err) {
    console.error("❌ Error fetching tokens:", err.message);
    res.status(500).json({ error: "Failed to fetch live tokens" });
  }
});

app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
