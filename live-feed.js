const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL_MS = 5000; // fetch every 5 seconds
const MAX_TOKENS_IN_MEMORY = 200; // keep only newest 200 tokens

// Supabase config
const SUPABASE_URL = 'https://ghtecnfzvazguhtrqxgf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdodGVjbmZ6dmF6Z3VodHJxeGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDU1MDAsImV4cCI6MjA3NDcyMTUwMH0.yuSckFtSjXmCelJFRjhUHyVvtaXIaK4dlLXnGPCVDJk';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// In-memory token storage
let tokens = [];

// Map raw token data to DB-friendly structure
function mapTokenForDB(raw) {
    return {
        coinMint: raw.coinMint,
        name: raw.name,
        ticker: raw.ticker || '',
        creationTime: new Date(raw.creationTime).toISOString(),
        imageUrl: raw.imageUrl || '',
        marketCap: raw.marketCap || 0,
        volume: raw.volume || 0,
        twitter: raw.twitter || '',
        telegram: raw.telegram || '',
        website: raw.website || '',
        rawData: raw
    };
}

// Fetch latest tokens from Pump.fun
async function fetchTokens() {
    try {
        const API_URL = 'https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=50';
        const { data } = await axios.get(API_URL);
        const newTokensRaw = data?.data || data?.coins || [];

        let newCount = 0;

        for (const raw of newTokensRaw) {
            if (!tokens.find(t => t.coinMint === raw.coinMint)) {
                const dbToken = mapTokenForDB(raw);

                // Insert into Supabase
                const { error } = await supabase
                    .from('tokens')
                    .upsert(dbToken, { onConflict: ['coinMint'] });
                if (error) console.error('❌ Supabase insert error:', error.message);

                tokens.push({ ...dbToken, fetchedAt: Date.now() });
                newCount++;
            }
        }

        // Keep only newest MAX_TOKENS_IN_MEMORY
        tokens = tokens.slice(-MAX_TOKENS_IN_MEMORY);
        if (newCount > 0)
            console.log(`✅ Fetched ${newCount} new tokens — total in memory: ${tokens.length}`);
    } catch (err) {
        console.error('❌ Error fetching tokens:', err.message);
    }
}

// Start polling
setInterval(fetchTokens, POLL_INTERVAL_MS);
fetchTokens(); // initial fetch

// API endpoint for frontend
app.get('/tokens', (req, res) => {
    // Only send required fields for frontend
    const filtered = tokens.map(t => ({
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
    res.json(filtered);
});

app.listen(PORT, () => console.log(`🚀 Live feed server running on http://localhost:${PORT}`));
