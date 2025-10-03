// server.js (CommonJS)
const express = require("express");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
require('dotenv').config();


const app = express();
app.use(express.json());

const CACHE_FILE = path.join(__dirname, "solana-news.json");
const REFRESH_SECRET = process.env.REFRESH_SECRET_KEY || "dipesh6366";

// Fetch Solana news from Gemini AI
async function fetchSolanaNews() {
    try {
        const prompt = `
Give me latest 3 Solana news updates in JSON array format with fields: 
title, content, source_url, event_date.
`;
        const response = await axios.post(
            "https://api.gemini.com/v1/ai/chat/completions",
            {
                model: "gemini-2.5-flash",
                messages: [{ role: "user", content: prompt }],
            },
            {
                headers: { "Authorization": `Bearer ${process.env.GEMINI_API_KEY}` },
            }
        );

        const text = response.data.choices[0].message.content;

        // Remove ```json blocks if Gemini adds them
        const jsonText = text.replace(/```json/g, "").replace(/```/g, "").trim();

        const news = JSON.parse(jsonText);
        return news;
    } catch (err) {
        console.error("Error parsing Gemini response:", err.message);
        return [];
    }
}

// Refresh cache endpoint
app.post("/refresh-solan-news", async (req, res) => {
    if (!req.body.key || req.body.key !== REFRESH_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const news = await fetchSolanaNews();
        fs.writeFileSync(CACHE_FILE, JSON.stringify(news, null, 2));
        res.json({ message: "Cache refreshed!", data: news });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to refresh cache" });
    }
});

// Get cached Solana news
app.get("/solana-news", (req, res) => {
    try {
        if (!fs.existsSync(CACHE_FILE)) {
            return res.status(400).json({ error: "Cache not ready, please refresh first." });
        }
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to read cache" });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ WatchX backend running at http://localhost:${PORT}`);
});
