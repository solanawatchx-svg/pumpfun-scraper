const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_TOKENS_IN_MEMORY = 200; // keep only latest N tokens

// Supabase config
const SUPABASE_URL = 'https://ghtecnfzvazguhtrqxgf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdodGVjbmZ6dmF6Z3VodHJxeGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDU1MDAsImV4cCI6MjA3NDcyMTUwMH0.yuSckFtSjXmCelJFRjhUHyVvtaXIaK4dlLXnGPCVDJk';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Memory store for live tokens
let liveTokens = [];

// Function to fetch latest tokens from Pump.fun backend
async function fetchLatestTokens() {
    try {
        const url = 'https://advanced-api-v2.pump.fun/coins/list?sortBy=creationTime&limit=50';
        const response = await axios.get(url);
        const tokens = response.data?.data || response.data?.coins || [];

        if (tokens.length) {
            let newCount = 0;

            for (const token of tokens) {
                const exists = liveTokens.find(t => t.coinMint === token.coinMint);
                if (!exists) {
                    liveTokens.unshift({ ...token, fetchedAt: Date.now() });
                    newCount++;

                    // Save to Supabase (creationTime as ISO string)
                    const { error } = await supabase
                        .from('tokens')
                        .upsert(
                            {
                                coinMint: token.coinMint,
                                name: token.name,
                                symbol: token.symbol,
                                creationTime: new Date(token.creationTime).toISOString(),
                                rawData: token
                            },
                            { onConflict: ['coinMint'] }
                        );
                    if (error) console.error('❌ Supabase insert error:', error.message);
                }
            }

            // Keep only newest MAX_TOKENS_IN_MEMORY tokens
            if (liveTokens.length > MAX_TOKENS_IN_MEMORY) {
                liveTokens = liveTokens.slice(0, MAX_TOKENS_IN_MEMORY);
            }

            console.log(`✅ Fetched ${newCount} new tokens — total in memory: ${liveTokens.length}`);
        }
    } catch (err) {
        console.error('❌ Error fetching tokens:', err.message);
    }
}

// Polling loop
setInterval(fetchLatestTokens, POLL_INTERVAL);
fetchLatestTokens(); // initial fetch

// API endpoint for frontend to get live tokens
app.get('/live-tokens', (req, res) => {
    res.json({
        timestamp: new Date().toISOString(),
        tokens: liveTokens,
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Live feed server running on http://localhost:${PORT}`);
});
