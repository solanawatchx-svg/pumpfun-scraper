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
// --- LIVE TOKENS ENDPOINT (Time-gated + Cache) ---
// ===============================
const MAX_CACHE = 1000;
const recentMints = new Set();
let mintHistory = [];
let lastSeenCreationTime = 0; // epoch ms of the newest token we've sent

// helper to reset cache during testing
app.get("/live-tokens-reset-cache", (req, res) => {
  recentMints.clear();
  mintHistory = [];
  lastSeenCreationTime = 0;
  console.log("🔁 live-tokens cache reset");
  res.json({ ok: true });
});

app.get("/live-tokens", async (req, res) => {
  try {
    const { data } = await axios.get(ENDPOINTS.scan, { timeout: 15000 });
    const tokensRaw = Array.isArray(data) ? data : data.coins || data.data || [];

    // Normalize and ensure we have coinMint and creationTime
    const normalized = tokensRaw.map(t => {
      const coinMint = t.coinMint || t.mint || t.tokenMint || null;
      // some responses use 'creationTime' (ms) — ensure it's a number
      const creationTime = t.creationTime || t.createdTimestamp || t.fetchedAt || null;
      return {
        raw: t,
        coinMint,
        creationTime: creationTime ? Number(creationTime) : null
      };
    }).filter(x => x.coinMint && x.creationTime); // drop if no mint or no creationTime

    // sort newest first (defensive)
    normalized.sort((a, b) => b.creationTime - a.creationTime);

    // If this is the *very first* run (no cache), we will prime cache but still return the current list once.
    const isFirstRun = recentMints.size === 0 && lastSeenCreationTime === 0;

    // Collect candidates that are newer than lastSeenCreationTime OR same time but not yet cached
    const candidates = [];
    const seenInBatch = new Set();
    for (const item of normalized) {
      // skip duplicates within batch
      if (seenInBatch.has(item.coinMint)) continue;
      seenInBatch.add(item.coinMint);

      if (isFirstRun) {
        // On first run treat these as "current state" — include them (but also prime cache below)
        candidates.push(item);
      } else {
        // only accept strictly newer creationTime, or equal time but mint wasn't sent before
        if (item.creationTime > lastSeenCreationTime) {
          candidates.push(item);
        } else if (item.creationTime === lastSeenCreationTime && !recentMints.has(item.coinMint)) {
          candidates.push(item);
        } // else ignore older/equal already-seen tokens
      }
    }

    // If nothing new, return empty quickly
    if (candidates.length === 0) {
      return res.json({ tokens: [] });
    }

    // Map candidates to frontend shape
    const mapped = candidates.map(i => {
      const t = i.raw;
      const imageUrl = (t.imageUrl || t.image)
        ? `https://api.solanawatchx.site/image-proxy?url=${encodeURIComponent(t.imageUrl || t.image)}`
        : null;
      return {
        coinMint: i.coinMint,
        name: t.name || "",
        ticker: t.ticker || t.symbol || "",
        imageUrl,
        marketCap: t.marketCap || t.allTimeHighMarketCap || t.marketCapUsd || 0,
        volume: t.volume || t.usdVolume || 0,
        twitter: t.twitter || null,
        telegram: t.telegram || null,
        website: t.website || null,
        creationTime: i.creationTime
      };
    });

    // Update cache: add coins we are about to send
    for (const m of mapped) {
      if (!recentMints.has(m.coinMint)) {
        recentMints.add(m.coinMint);
        mintHistory.push(m.coinMint);
      }
    }
    // Trim cache
    if (mintHistory.length > MAX_CACHE) {
      const overflow = mintHistory.splice(0, mintHistory.length - MAX_CACHE);
      for (const mm of overflow) recentMints.delete(mm);
    }

    // Update lastSeenCreationTime: set to max creationTime we just sent
    const maxTime = Math.max(...mapped.map(x => x.creationTime));
    if (maxTime > lastSeenCreationTime) lastSeenCreationTime = maxTime;

    // Sort mapped newest first before sending (defensive)
    mapped.sort((a, b) => b.creationTime - a.creationTime);

    console.log(`🆕 Sent ${mapped.length} tokens; cache=${recentMints.size}; lastTime=${lastSeenCreationTime}`);

    return res.json({ tokens: mapped });
  } catch (err) {
    console.error("❌ Error fetching live tokens:", err && err.message ? err.message : err);
    return res.status(500).json({ error: "Failed to fetch live tokens" });
  }
});



// ===============================
// --- START SERVER ---
// ===============================
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
