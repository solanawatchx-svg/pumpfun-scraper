const axios = require("axios");
const fs = require("fs");

const ENDPOINTS = {
  scan: "https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=100&offset=0",
  byMarketCap: "https://advanced-api-v2.pump.fun/coins/list?sortBy=marketCap&limit=100&offset=0",
  graduated: "https://advanced-api-v2.pump.fun/coins/list?graduated=true&sortBy=creationTime&limit=100&offset=0"
};

async function fetchPumpfunBackend() {
  let results = { scan: [], byMarketCap: [], graduated: [] };

  for (const [key, url] of Object.entries(ENDPOINTS)) {
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const data = res.data;

      // The structure might be { data: [...], coins: [...], etc. }
      const arr = Array.isArray(data)
        ? data
        : data.coins || data.data || data.items || [];

      results[key] = arr;
      console.log(`✅ Captured ${arr.length} items from [${key}]`);
    } catch (err) {
      console.error(`❌ Error fetching [${key}]:`, err.message);
    }
  }

  fs.writeFileSync("out.json", JSON.stringify(results, null, 2));
  console.log("📁 Saved backend results to out.json");
}

fetchPumpfunBackend();
