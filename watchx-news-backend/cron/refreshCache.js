import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const SERP_API_KEY = process.env.SERP_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CACHE_FILE = "../cache.json"; // relative path from cron folder
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

async function searchSerpApi(query) {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&api_key=${SERP_API_KEY}&tbs=qdr:d`;
  const res = await fetch(url);
  return await res.json();
}

async function extractEventsFromGemini(results) {
  const payload = {
    prompt: `Extract Solana opportunities from these search results in JSON array format:
[
  {
    "project_name": "...",
    "token_symbol": "...",
    "event_type": "New Token Launch | Airdrop | Exchange Listing",
    "source_url": "...",
    "short_description": "...",
    "event_date": "YYYY-MM-DD"
  }
]
Search results: ${JSON.stringify(results.organic_results)}
`,
    model: "gemini-1.5",
    temperature: 0
  };

  const res = await fetch("https://api.gemini.com/v1/ai/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GEMINI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  try {
    return JSON.parse(data.choices[0].text);
  } catch {
    console.error("Gemini returned non-JSON:", data);
    return [];
  }
}

async function refreshCache() {
  try {
    const queries = [
      "new solana token launch today",
      "solana airdrop confirmed today",
      "binance listing solana token"
    ];

    let allEvents = [];
    for (const q of queries) {
      const serpData = await searchSerpApi(q);
      const events = await extractEventsFromGemini(serpData);
      allEvents = allEvents.concat(events);
    }

    const responseData = {
      date: new Date().toISOString().split("T")[0],
      opportunities: allEvents
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), data: responseData }, null, 2));
    console.log("✅ Cache refreshed successfully at", new Date().toLocaleString());
  } catch (err) {
    console.error("❌ Failed to refresh cache:", err);
  }
}

// --- Run immediately ---
refreshCache();

// --- Optional: run every hour ---
// setInterval(refreshCache, CACHE_DURATION);
