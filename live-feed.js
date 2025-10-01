// live-feed.js
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = 5000; // fetch every 5 seconds
const MAX_TOKENS = 200; // keep latest 200 tokens in memory

let liveTokens = []; // in-memory storage for live tokens

// --- Fetch latest tokens from Pump.fun backend ---
async function fetchTokens() {
    try {
        const url = 'https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=50';
        const { data } = await axios.get(url);
        const tokens = data?.data || data?.coins || [];

        let newCount = 0;
        for (const t of tokens) {
            if (!liveTokens.find(x => x.coinMint === t.coinMint)) {
                // store only necessary fields
                liveTokens.unshift({
                    coinMint: t.coinMint,
                    name: t.name,
                    ticker: t.symbol,
                    marketCap: t.marketCap,
                    volume: t.volume,
                    imageUrl: t.imageUrl,
                    twitter: t.twitter,
                    telegram: t.telegram,
                    website: t.website,
                    creationTime: t.creationTime
                });
                newCount++;
            }
        }

        // keep only latest MAX_TOKENS
        liveTokens = liveTokens.slice(0, MAX_TOKENS);
        console.log(`✅ Fetched ${newCount} new tokens — total in memory: ${liveTokens.length}`);
    } catch (err) {
        console.error('❌ Fetch error:', err.message);
    }
}

// Start polling
setInterval(fetchTokens, POLL_INTERVAL);
fetchTokens(); // initial fetch

// --- Endpoint for frontend ---
app.get('/live-tokens', (req, res) => {
    res.json({ tokens: liveTokens });
});

// --- Start server ---
app.listen(PORT, () => console.log(`🚀 Live feed server running on http://localhost:${PORT}`));
