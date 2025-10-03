// --- WatchX News Backend (CommonJS version) ---
const express = require("express");
const fs = require("fs");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REFRESH_SECRET_KEY = process.env.REFRESH_SECRET_KEY || "dipesh6366";
const CACHE_FILE = "cache.json";

// Load cache from file if exists
let cache = [];
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    cache = JSON.parse(raw);
  }
} catch (err) {
  console.error("Failed to read cache:", err);
  cache = [];
}

// --- Function to fetch Solana news from Gemini ---
async function fetchSolanaNews() {
  const messages = [
    {
      role: "system",
      content: "You are a crypto news AI. Generate Solana news updates in JSON format."
    },
    {
      role: "user",
      content: `
Generate 3 latest Solana news updates in JSON format.
Each news should include:
- title
- content (2-3 sentences)
- source_url
- event_date (YYYY-MM-DD)
Return ONLY a valid JSON array, no extra text or formatting.
`
    }
  ];

  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + GEMINI_API_KEY
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages,
        temperature: 0.7
      })
    });

    const data = await res.json();
    console.log("=== Gemini Raw Output ===");
    console.log(JSON.stringify(data, null, 2));
    console.log("=========================");

    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      let content = data.choices[0].message.content;

      // Remove ```json or ``` wrappers
      content = content.replace(/```json/i, "").replace(/```/g, "").trim();

      try {
        return JSON.parse(content);
      } catch (err) {
        console.error("Failed to parse Gemini output as JSON:", err);
        return [];
      }
    } else {
      console.error("Gemini returned no content.");
      return [];
    }
  } catch (err) {
    console.error("Error calling Gemini API:", err);
    return [];
  }
}

// --- Refresh cache function ---
async function refreshCache() {
  console.log("🔄 Refreshing Gemini Solana news...");
  const news = await fetchSolanaNews();
  if (news.length > 0) {
    cache = news;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log("✅ Cache refreshed with", news.length, "items.");
  } else {
    console.log("⚠️ Cache refresh failed, keeping old data.");
  }
}

// --- Auto-refresh every 3 hours ---
setInterval(refreshCache, 3 * 60 * 60 * 1000);

// --- Endpoints ---
app.get("/solana-news", (req, res) => {
  if (cache.length === 0) {
    return res.status(400).json({ error: "Cache not ready, please refresh first." });
  }
  res.json(cache);
});

app.post("/refresh-solan-news", async (req, res) => {
  const { key } = req.body;
  if (key !== REFRESH_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await refreshCache();
  res.json({ message: "Cache refreshed!", data: cache });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
  refreshCache(); // refresh once on startup
});
