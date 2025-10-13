document.addEventListener("DOMContentLoaded", () => {
    // ===============================
    // --- LIVE TOKEN FEED ---
    // ===============================
    const POLLING_INTERVAL_MS = 4000;
    const displayedTokens = new Set();
    const feedContainer = document.getElementById('token-feed');
    const statusElement = document.getElementById('status');
    const MAX_CARDS = 400;       // how many DOM cards to keep (doesn't affect displayedTokens memory)
    let isFetching = false; 

    const formatNum = (n) =>
        n >= 1e6 ? `$${(n/1e6).toFixed(2)}M`
        : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K`
        : `$${n.toFixed(0)}`;

    const formatAge = (ms) => {
        const minutes = Math.floor((Date.now() - ms) / 60000);
        return minutes < 60
            ? `${minutes}m ago`
            : `${Math.floor(minutes/60)}h ${minutes%60}m ago`;
    };

// add near top of file (inside same scope as POLLING_INTERVAL_MS)
const MAX_CARDS = 400;       // how many DOM cards to keep (doesn't affect displayedTokens memory)
let isFetching = false;      // prevent overlapping requests

// --- improved fetchLiveTokens ---
async function fetchLiveTokens() {
    if (isFetching) return; // avoid concurrent runs
    isFetching = true;

    try {
        if (statusElement) {
            statusElement.style.display = 'block';
            statusElement.textContent = 'Fetching live tokens...';
        }

        const response = await fetch('https://api.solanawatchx.site/live-tokens');
        if (!response.ok) throw new Error('Failed to fetch live tokens');

        const { tokens: rawData } = await response.json();
        if (statusElement) statusElement.style.display = 'none';

        if (!Array.isArray(rawData) || rawData.length === 0) {
            isFetching = false;
            return;
        }

        // Normalize and sort locally by creationTime (newest first) — defensive
        const data = rawData
            .map(t => ({
                coinMint: t.coinMint,
                name: t.name,
                ticker: t.ticker,
                imageUrl: t.imageUrl ? `https://api.solanawatchx.site/image-proxy?url=${encodeURIComponent(t.imageUrl)}` : null,
                marketCap: t.marketCap,
                volume: t.volume,
                twitter: t.twitter,
                telegram: t.telegram,
                website: t.website,
                creationTime: Number(t.creationTime) || 0
            }))
            .sort((a, b) => b.creationTime - a.creationTime);

        // Filter out tokens we already showed
        const newTokens = data.filter(t => !displayedTokens.has(t.coinMint));
        if (newTokens.length === 0) {
            isFetching = false;
            return;
        }

        // Mark them as displayed (do NOT remove from this set later)
        newTokens.forEach(t => displayedTokens.add(t.coinMint));

        // Build fragment (old -> new order preserved)
        const fragment = document.createDocumentFragment();
        // we want newest first on top; newTokens is sorted newest->oldest.
        // To prepend them in correct order we iterate from last to first and prepend each,
        // OR create nodes in order and prepend the whole fragment. We'll append to fragment
        // in reverse so that when we prepend fragment the order remains newest->oldest.
        for (let i = newTokens.length - 1; i >= 0; i--) {
            const node = createTokenElement(newTokens[i]);
            node.style.opacity = '0';
            fragment.prepend(node); // keep same final order when fragment is prepended
        }

        // Insert all at once
        feedContainer.prepend(fragment);

        // animate new ones and set opacity to 1
        requestAnimationFrame(() => {
            newTokens.forEach(t => {
                const el = feedContainer.querySelector(`[data-mint="${t.coinMint}"]`);
                if (el) {
                    el.classList.add('new-token-animation');
                    el.style.opacity = '1';
                }
            });
        });

        // Trim DOM only (don't touch displayedTokens set)
        while (feedContainer.children.length > MAX_CARDS) {
            feedContainer.removeChild(feedContainer.lastChild);
            // do NOT delete from displayedTokens — that keeps duplicates away
        }

    } catch (err) {
        console.error("❌ Fetch Error:", err);
        if (statusElement) statusElement.innerHTML = `<span>Connection failed. Retrying...</span>`;
    } finally {
        isFetching = false;
    }
}


    function createTokenElement(token) {
        const card = document.createElement('div');
        card.className = 'token-card rounded-lg p-3 sm:p-4';

        const socialsHTML = [
            token.twitter ? `<a href="${token.twitter}" target="_blank">Twitter</a>` : "",
            token.telegram ? `<a href="${token.telegram}" target="_blank">Telegram</a>` : "",
            token.website ? `<a href="${token.website}" target="_blank">Website</a>` : ""
        ].join('');

        const pumpLink = `https://pump.fun/${token.coinMint}`;
        const dexLink = `https://dexscreener.com/solana/${token.coinMint}`;

        card.innerHTML = `
            <div class="grid grid-cols-12 gap-3 items-center">
                <div class="col-span-2 sm:col-span-1">
                    <img src="${token.imageUrl}" alt="${token.ticker}" class="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover">
                </div>
                <div class="col-span-10 sm:col-span-5 flex flex-col justify-center">
                    <div class="flex items-center space-x-2">
                        <p class="font-bold text-white truncate">${token.name}</p>
                        <div class="flex items-center space-x-1.5">${socialsHTML}</div>
                    </div>
                    <div class="flex items-center space-x-2 text-xs text-gray-400 flex-wrap">
                        <span>$${token.ticker}</span>
                        <span class="text-gray-500">•</span>
                        <span>${formatAge(token.creationTime)}</span>
                        <div class="copy-address-container flex items-center space-x-1 cursor-pointer hover:text-white" title="Copy Address">
                            <span class="font-mono token-address">${token.coinMint.substring(0, 4)}...${token.coinMint.substring(token.coinMint.length - 4)}</span>
                        </div>
                    </div>
                </div>
                <div class="hidden sm:col-span-3 sm:grid grid-cols-2 gap-2 text-xs text-center">
                    <div><div class="text-gray-500">MC</div><div class="font-semibold text-white">${formatNum(token.marketCap)}</div></div>
                    <div><div class="text-gray-500">Vol</div><div class="font-semibold text-white">${formatNum(token.volume)}</div></div>
                </div>
                <div class="col-span-12 sm:col-span-3 flex items-center justify-end space-x-2">
                   <a href="${pumpLink}" target="_blank" class="action-btn p-2 rounded-md">Pump</a>
                   <a href="${dexLink}" target="_blank" class="action-btn p-2 rounded-md">Dex</a>
                </div>
            </div>
        `;

        // copy address logic
        const copyContainer = card.querySelector('.copy-address-container');
        const addressText = card.querySelector('.token-address');
        copyContainer.addEventListener('click', () => {
            navigator.clipboard.writeText(token.coinMint);
            const original = addressText.textContent;
            addressText.textContent = "Copied!";
            setTimeout(() => { addressText.textContent = original; }, 1500);
        });

        return card;
    }

    // --- start polling ---
    fetchLiveTokens();
    setInterval(fetchLiveTokens, POLLING_INTERVAL_MS);
});
