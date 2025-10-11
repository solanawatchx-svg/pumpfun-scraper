// index.js
// SolanaWatchX backend: image proxy, live tokens, live SOL price (with short cache) + CORS
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

// Allowed frontend origins (update as necessary)
const ALLOWED_ORIGINS = new Set([
  "https://www.solanawatchx.site",
  "https://solanawatchx.site",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

// Basic CORS middleware: echo origin if allowed, otherwise use wildcard
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    // fallback to permissive header while you're debugging / deploying (change to allowed origins for production)
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// small helper to safely get a URL string
function normalizeUrlString(u) {
  if (!u) return null;
  try {
    return String(u);
  } catch (e) {
    return null;
  }
}

// ===============================
// --- IMAGE PROXY ---
// ===============================
// Usage: /image-proxy?url=<encoded-url>
// Handles: direct urls, images.pump.fun wrapped URLs (with src or ipfs query), ipfs:// urls
app.get("/image-proxy", async (req, res) => {
  try {
    let targetUrl = normalizeUrlString(req.query.url);
    if (!targetUrl) return res.status(400).send("Missing url param");

    // handle ipfs:// URIs quickly
    if (targetUrl.startsWith("ipfs://")) {
      targetUrl = targetUrl.replace(/^ipfs:\/\//i, "https://ipfs.io/ipfs/");
    }

    // If the provided URL looks like images.pump.fun/coin-image/...?...src=..., prefer src param
    try {
      const parsed = new URL(targetUrl);
      const srcParam = parsed.searchParams.get("src");
      const ipfsParam = parsed.searchParams.get("ipfs");
      if (srcParam) {
        targetUrl = srcParam;
      } else if (ipfsParam && !targetUrl.startsWith("ipfs:")) {
        // ipfs param can be raw hash or encoded object — prefer plain hash if looks like a hash
        // if ipfs param looks like a raw hash (Qm...), use ipfs gateway
        if (/^Qm|^bafy/i.test(ipfsParam)) {
          targetUrl = `https://ipfs.io/ipfs/${ipfsParam}`;
        } else {
          // fallback to original targetUrl; sometimes ipfs param is encoded JSON/metadata
          targetUrl = targetUrl;
        }
      }
    } catch (e) {
      // ignore URL parse errors and use original targetUrl
    }

    // Basic scheme guard
    if (!/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).send("Unsupported URL scheme");
    }

    // Fetch and stream image (follow redirects)
    const upstream = await fetch(targetUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SolanaWatchX/1.0; +https://solanawatchx.site)"
      },
      timeout: 15000
    });

    if (!upstream.ok) {
      console.warn("Image proxy upstream non-ok:", upstream.status, targetUrl);
      return res.status(502).send("Failed to fetch image");
    }

    // Copy content-type if available
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    // Let browsers cache short-term; adjust if needed
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=30");

    // Stream body
    upstream.body.pipe(res);
  } catch (err) {
    console.error("Image proxy error:", err && err.message ? err.message : err);
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

    // Rewrite image URLs to go through our image-proxy
    const mappedTokens = tokens.map(t => {
      const imageUrl = normalizeUrlString(t.imageUrl) || normalizeUrlString(t.image) || null;
      return {
        ...t,
        imageUrl: imageUrl
          ? `https://${req.headers.host.replace(/:\d+$/, "")}/image-proxy?url=${encodeURIComponent(imageUrl)}`
          : null
      };
    });

    res.json({ tokens: mappedTokens, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("❌ Error fetching live tokens:", err && err.message ? err.message : err);
    res.status(500).json({ error: "Failed to fetch live tokens" });
  }
});

// ===============================
// --- LIVE SOL PRICE (with short cache) ---
// ===============================
let solCache = { ts: 0, data: null };
const SOL_TTL = 5000; // ms

app.get("/live-sol-price", async (req, res) => {
  try {
    const now = Date.now();
    if (solCache.data && (now - solCache.ts) < SOL_TTL) {
      return res.json({ ...solCache.data, cached: true, ts: new Date(solCache.ts).toISOString() });
    }

    const upstream = await axios.get("https://frontend-api-v3.pump.fun/sol-price", { timeout: 10000 });
    const payload = upstream.data || {};
    solCache = { ts: now, data: payload };
    res.json({ ...payload, cached: false, ts: new Date(now).toISOString() });
  } catch (err) {
    console.error("❌ Error fetching SOL price:", err && err.message ? err.message : err);
    if (solCache.data) {
      // return stale cache if available
      return res.json({ ...solCache.data, cached: true, stale: true, ts: new Date(solCache.ts).toISOString() });
    }
    res.status(502).json({ error: "Failed to fetch SOL price" });
  }
});

// Simple root
app.get("/", (req, res) => res.send("SolanaWatchX API is running"));

// Start
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
