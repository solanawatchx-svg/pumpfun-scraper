// live-feed.js
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_TOKENS_IN_MEMORY = 200;

// Supabase config
const SUPABASE_URL = 'https://ghtecnfzvazguhtrqxgf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdodGVjbmZ6dmF6Z3VodHJxeGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDU1MDAsImV4cCI6MjA3NDcyMTUwMH0.yuSckFtSjXmCelJFRjhUHyVvtaXIaK4dlLXnGPCVDJk'; // use service role key on server
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let liveTokens = []; // in-memory storage

const API_URL = 'https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=50';

// Helper: map Pump.fun token to DB-friendly object
function mapTokenForDB(token) {
    const raw = token.rawData || token; // fallback if rawData exists
    return {
        coinMint: token.coinMint || raw.coinMint,
        name: token.name || raw.name,
        ticker: token.symbol || raw.ticker,
        creationTime: new Date(token.creationTime || raw.creationTime).toISOString(),
        imageUrl: token.imageUrl || raw.imageUrl,
        marketCap: token.marketCap || raw.marketCap || 0,
        volume: token.volume || raw.volume || 0,
        twitter: token.twitter || raw.twitter || '',
        telegram: token.telegram || raw.telegram || '',
        website: token.website || raw.website || '',
        rawData: raw
    };
}

// Fetch latest tokens
async function fetchLatestTokens() {
    try {
        const { data } = await axios.get(API_URL);
        const tokens = data?.data || data?.coins || [];

        let newCount = 0;

        for (const token of tokens) {
            const exists = liveTokens.find(t => t.coinMint === token.coinMint);
            if (!exists) {
                const dbToken = mapTokenForDB(token);

                // Save to Supabase
                const { error } = await supabase
                    .from('tokens')
                    .upsert(dbToken, { onConflict: ['coinMint'] });
                if (error) console.error('❌ Supabase insert error:', error.message);

                // Add to in-memory array
                liveTokens.push(dbToken);
                newCount++;
            }
        }

        // Keep only latest MAX_TOKENS_IN_MEMORY
        if (liveTokens.length > MAX_TOKENS_IN_MEMORY) {
            liveTokens = liveTokens.slice(-MAX_TOKENS_IN_MEMORY);
        }

        if (newCount) {
            console.log(`✅ Fetched ${newCount} new tokens — total in memory: ${liveTokens.length}`);
        }
    } catch (err) {
        console.error('❌ Error fetching tokens:', err.message);
    }
}

// Polling loop
setInterval(fetchLatestTokens, POLL_INTERVAL_MS);
fetchLatestTokens();

// API endpoint for frontend
app.get('/live-tokens', (req, res) => {
    const simplifiedTokens = liveTokens.map(t => ({
        coinMint: t.coinMint,
        name: t.name,
        ticker: t.ticker,
        imageUrl: t.imageUrl,
        marketCap: t.marketCap,
        volume: t.volume,
        twitter: t.twitter,
        telegram: t.telegram,
        website: t.website,
        creationTime: t.creationTime
    }));

    res.json({
        timestamp: new Date().toISOString(),
        tokens: simplifiedTokens
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Live feed server running on http://localhost:${PORT}`);
});
