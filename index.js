const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: ["https://solanawatchx.site", "https://www.solanawatchx.site"], // allow both
  methods: "GET",
  credentials: false
}));

// ========== Pump.fun API endpoints ==========
const ENDPOINTS = {
  scan: "https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=100&offset=0",
};

// Fetch Pump.fun tokens and return in clean format
app.get("/live-tokens", async (req, res) => {
  try {
    const response = await axios.get(ENDPOINTS.scan, { timeout: 15000 });
    const coins = response.data.coins || response.data.data || response.data.items || [];

    // Clean & normalize tokens for frontend
    const tokens = coins.map(t => ({
      coinMint: t.mint || t.coinMint,
      name: t.name,
      ticker: t.symbol || t.ticker,
      imageUrl: t.image_uri || t.imageUrl,
      marketCap: t.marketCap || 0,
      volume: t.volume || 0,
      twitter: t.twitter,
      telegram: t.telegram,
      website: t.website,
      creationTime: t.creationTime || Date.now()
    }));

    res.json({ tokens });
  } catch (err) {
    console.error("❌ Error fetching Pump.fun:", err.message);
    res.status(500).json({ error: "Failed to fetch tokens" });
  }
});

// ======== IMAGE PROXY (fix broken imagedelivery.net) ========
app.get("/image-proxy", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send("Missing url param");

  try {
    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    res.set("Content-Type", response.headers["content-type"]);
    res.send(response.data);
  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(500).send("Image fetch failed");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});
