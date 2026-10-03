import { Products } from './products.js';

// ---------- Knowledge (edit/update me) ----------
const STORE = {
    name: 'Etec Shop',
    description: 'an online store selling electronics, clothing, home, kitchen, sports, books, beauty, toys, office and outdoor products',
    contact: 'support@etecshop.example / +855 00 000 000',
    shipping: 'We ship nationwide. Standard delivery takes 2-5 business days.',
    payment: 'ABA, Visa/Mastercard, PayPal, and cash on delivery.',
    returns: 'Returns accepted within 14 days if the item is unused and in original packaging.',
    hours: 'Mon-Sun, 8:00-22:00 (UTC+7).',
    languages: 'English and Khmer.',
};

// ---------- Text helpers ----------
const lower = (s) => (s || '').toLowerCase();
const STOPWORDS = new Set('i,want,need,show,me,a,an,the,buy,find,looking,for,of,to,do,you,have,any,please,can,get,is,are,it,its,this,that,them,they,what,which,tell,more,about,something,some,recommend,suggest,give'.split(','));

function stem(w) {
    return w.replace(/('s)$/, '').replace(/(es|s)$/, '').replace(/ing$/, '').replace(/tion$/, 'te');
}

const tokens = (s) => lower(s).replace(/[^a-z0-9\s$.]/g, ' ').split(/\s+/).filter(Boolean).map(stem);

// synonyms: user word → words that should also match
const SYNONYMS = {
    headphone: ['speaker', 'earbud', 'headset'],
    earbud: ['headphone', 'speaker'],
    shirt: ['tshirt', 't-shirt', 'top'],
    tshirt: ['shirt', 'top'],
    pant: ['trouser', 'jean', 'short'],
    shoe: ['sneaker', 'boot'],
    phone: ['smartphone', 'mobile'],
    watch: ['smartwatch'],
    lamp: ['light'],
    mouse: ['keyboard'],
    keyboard: ['mouse'],
    book: ['storybook', 'novel'],
    toy: ['game', 'block', 'plush'],
    game: ['toy'],
    candle: ['scented'],
    mug: ['cup'],
    bottle: ['flask', 'tumbler'],
    bag: ['backpack', 'purse'],
};

function expandSynonyms(toks) {
    const out = new Set(toks);
    for (const t of toks) {
        const key = t.replace(/-/g, '');
        for (const [k, vals] of Object.entries(SYNONYMS)) {
            if (k === key || vals.includes(key)) {
                out.add(k);
                vals.forEach((v) => out.add(v));
            }
        }
    }
    return [...out];
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[m][n];
}

// typo-tolerant token match: exact, prefix, or small edit distance
function tokenMatch(queryTok, word) {
    if (queryTok === word) return true;
    if (queryTok.length >= 3 && word.startsWith(queryTok)) return true;
    if (word.length >= 3 && queryTok.startsWith(word)) return true;
    const maxDist = word.length <= 4 ? 1 : word.length <= 7 ? 2 : 3;
    return levenshtein(queryTok, word) <= maxDist;
}

function queryTokens(query) {
    return expandSynonyms(tokens(query).filter((t) => !STOPWORDS.has(t) && t.length >= 2 && !/^\d/.test(t)));
}

// ---------- Inverted search index (scales to ~1M products) ----------
// term -> Map(productIndex -> weight). One-time build; queries touch only matching docs.
let INDEX = null;
let INDEX_LENGTH = 0;

function buildIndex() {
    INDEX = new Map();
    const add = (term, idx, w) => {
        if (!term || term.length < 2) return;
        let entry = INDEX.get(term);
        if (!entry) { entry = new Map(); INDEX.set(term, entry); }
        entry.set(idx, (entry.get(idx) || 0) + w);
    };
    Products.forEach((p, idx) => {
        tokens(p.name).forEach((t) => add(t, idx, 5));
        tokens(p.category).forEach((t) => add(t, idx, 3));
        add(stem(lower(p.category)), idx, 2);
        tokens(p.description).forEach((t) => add(t, idx, 1));
    });
    INDEX_LENGTH = Products.length;
}

// candidate indexes for a query token: exact, prefix, or fuzzy (same first letter only)
function candidateIndexes(tok) {
    const scores = new Map(); // idx -> hits
    const exact = INDEX.get(tok);
    if (exact) for (const [idx, w] of exact) scores.set(idx, (scores.get(idx) || 0) + w);
    for (const term of INDEX.keys()) {
        if (term === tok || term[0] !== tok[0]) continue;
        if ((tok.length >= 3 && term.startsWith(tok)) || (term.length >= 3 && tok.startsWith(term))) {
            const entry = INDEX.get(term);
            for (const [idx, w] of entry) scores.set(idx, (scores.get(idx) || 0) + w);
        } else {
            const maxDist = term.length <= 4 ? 1 : term.length <= 7 ? 2 : 3;
            if (Math.abs(term.length - tok.length) <= maxDist && levenshtein(tok, term) <= maxDist) {
                const entry = INDEX.get(term);
                for (const [idx, w] of entry) scores.set(idx, (scores.get(idx) || 0) + Math.max(1, w - 1));
            }
        }
    }
    return scores;
}

function searchProducts(query, limit = 3) {
    if (!INDEX || INDEX_LENGTH !== Products.length) buildIndex();
    const toks = queryTokens(query);
    const total = new Map();
    for (const t of toks) {
        const hits = candidateIndexes(t);
        for (const [idx, w] of hits) total.set(idx, (total.get(idx) || 0) + w);
    }
    return [...total.entries()]
        .filter(([, s]) => s >= 3)
        .sort((a, b) => b[1] - a[1] || Products[a[0]].price - Products[b[0]].price)
        .slice(0, limit)
        .map(([idx]) => Products[idx]);
}

function findProductByRef(ref) {
    const num = String(ref).match(/\d+/);
    if (num) {
        const p = Products.find((p) => p.id === parseInt(num[0], 10));
        if (p) return p;
    }
    const results = searchProducts(ref, 1);
    return results.length ? results[0] : null;
}

function extractPriceLimit(query) {
    const m = query.match(/(under|below|less than|max|cheaper than|up to)\s*\$?\s*(\d+(\.\d+)?)/);
    if (m) return { max: parseFloat(m[2]) };
    const m2 = query.match(/(over|above|more than|min)\s*\$?\s*(\d+(\.\d+)?)/);
    if (m2) return { min: parseFloat(m2[2]) };
    return null;
}

function money(n) { return `$${n.toFixed(2)}`; }
function listStr(arr) { return arr.map((p) => `• ${p.name} — ${money(p.price)} (id ${p.id})`).join('\n'); }

// ---------- Session context ----------
let lastResults = []; // products from the last search/browse

// ---------- Intent engine ----------
export function reply(message) {
    const q = lower(message).trim();
    const cats = [...new Set(Products.map((p) => p.category))];

    if (/^(hi|hello|hey|yo|sup)\b/.test(q))
        return `Hello! Welcome to ${STORE.name}. I can help you find products, compare prices, and answer questions about shipping, payment, and returns. What are you looking for?`;

    if (/\b(thanks|thank you|thx)\b/.test(q)) return `You're welcome! Anything else I can help you find?`;
    if (/\b(bye|goodbye|see you)\b/.test(q)) return `Goodbye! Have a great day shopping at ${STORE.name}.`;
    if (/\b(contact|email|phone|whatsapp|support)\b/.test(q)) return `You can reach us at ${STORE.contact}. Business hours: ${STORE.hours}`;
    if (/\b(hour|open|close)\b/.test(q)) return `Our business hours are ${STORE.hours}`;
    if (/\b(ship|delivery|deliver)\b/.test(q)) return STORE.shipping;
    if (/\b(pay|payment|aba|paypal|card|cash)\b/.test(q)) return `We accept: ${STORE.payment}`;
    if (/\b(return|refund|exchange|cancel)\b/.test(q)) return STORE.returns;
    // follow-up about previous results: "tell me about the first one"
    const ord = q.match(/\b(first|second|third|1st|2nd|3rd|last)\b/);
    if (ord && lastResults.length && /\b(tell|about|detail|info|more|what|is|price)\b/.test(q)) {
        const idx = ord[1] === 'last' ? lastResults.length - 1 : ['first', '1st'].includes(ord[1]) ? 0 : ['second', '2nd'].includes(ord[1]) ? 1 : 2;
        const p = lastResults[idx];
        if (p) return `"${p.name}" costs ${money(p.price)}, category: ${p.category}. ${p.description}`;
    }

    // detail about a specific product: "details about id 5" / "tell me about earbuds"
    const aboutM = q.match(/(?:detail|tell me|info|about|more)\w* (?:about |on )?(.+)/);
    if (aboutM && !/\b(shop|store|site|etec|categor)\b/.test(q)) {
        const p = findProductByRef(aboutM[1]);
        if (p) return `"${p.name}" — ${money(p.price)} (${p.category}, id ${p.id}): ${p.description}`;
    }

    // compare: "compare mushroom and mug" / "compare id 1 and id 5"
    if (/\bcompare\b/.test(q)) {
        const parts = q.replace(/\bcompare\b/, '').split(/\band\b|\bvs\b|,/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
            const a = findProductByRef(parts[0]);
            const b = findProductByRef(parts[1]);
            if (a && b) {
                const cheaper = a.price <= b.price ? a : b;
                return `Comparison:\n• ${a.name}: ${money(a.price)} (${a.category})\n• ${b.name}: ${money(b.price)} (${b.category})\nCheaper option: ${cheaper.name}.`;
            }
            return `I couldn't find both products. Try using ids, e.g. "compare id 1 and id 5".`;
        }
    }

    if (/\b(language|khmer|english)\b/.test(q)) return `We support ${STORE.languages}`;
    if (/\b(about|what is|who are)\b/.test(q) && /\b(shop|store|site|etec)\b/.test(q))
        return `${STORE.name} is ${STORE.description}.`;

    // how many / stats
    if (/\bhow many\b/.test(q) && /\bproduct|item/.test(q)) return `We currently have ${Products.length} products across ${cats.length} categories.`;
    if (/\b(count|number of|total)\b/.test(q) && /\bcategor/.test(q)) return `We have ${cats.length} categories: ${cats.join(', ')}.`;

    if (/\b(categor|department|type)\w*\b/.test(q) && !/\b(shop by|browse|show)\b/.test(q) && !cats.some((c) => queryTokens(q).some((t) => tokenMatch(t, stem(c.toLowerCase()))))) {
        return `We have these categories: ${cats.join(', ')}. Which one interests you?`;
    }

    // direct category mention → browse it (handles typos like "kitchn")
    const qToks = tokens(q);
    const cat = cats.find((c) => qToks.some((t) => tokenMatch(t, stem(c.toLowerCase()))));
    if (cat) {
        const top = Products.filter((p) => p.category === cat).slice(0, 3);
        lastResults = top;
        return `Here are some ${cat} items:\n${listStr(top)}`;
    }

    if (/\b(cheap|expensive|price|cost)\b/.test(q) && /\b(most|highest|top)\b/.test(q)) {
        const p = [...Products].sort((a, b) => b.price - a.price)[0];
        return `Our most expensive item is "${p.name}" at ${money(p.price)}.`;
    }
    if (/\b(cheapest|lowest|budget|affordable)\b/.test(q)) {
        const p = [...Products].sort((a, b) => a.price - b.price)[0];
        return `Our most affordable item is "${p.name}" at ${money(p.price)}.`;
    }

    const limit = extractPriceLimit(q);
    if (limit) {
        let list = Products;
        if (limit.max) list = list.filter((p) => p.price <= limit.max);
        if (limit.min) list = list.filter((p) => p.price >= limit.min);
        const toks = tokens(q).filter((t) => !/\d/.test(t) && !['under', 'below', 'over', 'above', 'max', 'min', 'than', 'less', 'more', 'up', 'to', 'and', 'or'].map(stem).includes(t));
        if (toks.length) {
            const allowed = new Set(list.map((p) => p.id));
            const scored = searchProducts(toks.join(' '), 50).filter((p) => allowed.has(p.id));
            if (scored.length) list = scored;
            else return `I couldn't find matching products${limit.max ? ` under ${money(limit.max)}` : ''}. Try another keyword or budget.`;
        }
        const top = list.sort((a, b) => a.price - b.price).slice(0, 3);
        if (!top.length) return `I couldn't find products in that price range. Try a different budget.`;
        lastResults = top;
        return `Here are options${limit.max ? ` under ${money(limit.max)}` : ` over ${money(limit.min)}`}:\n${listStr(top)}`;
    }

    if (/\b(buy|order|purchase|checkout|cart)\b/.test(q) && /\b(how|want|like|to|add)\b/.test(q)) {
        return `To buy: find a product you like, click "AddToCart", then open your cart to checkout, choose payment (ABA, card, PayPal, or cash on delivery), and confirm. Need help finding a product?`;
    }

    // product search (typo + synonym tolerant)
    const found = searchProducts(message);
    if (found.length) {
        lastResults = found;
        return `Here ${found.length > 1 ? 'are some products' : 'is a product'} that might match:\n` +
            found.map((p) => `• ${p.name} — ${money(p.price)} (${p.category}, id ${p.id})`).join('\n') +
            `\nWant details on any of these, or help adding one to your cart?`;
    }

    return `I'm not sure about that. Try asking for a product name, category (electronics, clothing, etc.), a price like "under $50", comparing two items, or our shipping/payment/return policies. For more help, contact ${STORE.contact}.`;
}

// ---------- Chat UI ----------
function createChatUI() {
    const style = document.createElement('style');
    style.textContent = `
    #etec-chat-btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:#2563eb;color:#fff;border:none;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:9999}
    #etec-chat-panel{position:fixed;bottom:86px;right:20px;width:340px;max-width:90vw;height:440px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:none;flex-direction:column;z-index:9999;overflow:hidden;font-family:Arial,sans-serif}
    #etec-chat-head{background:#2563eb;color:#fff;padding:12px 16px;font-weight:bold}
    #etec-chat-msgs{flex:1;padding:12px;overflow-y:auto;font-size:14px;background:#f8fafc}
    .etec-msg{margin:6px 0;padding:8px 12px;border-radius:10px;max-width:85%;white-space:pre-line}
    .etec-bot{background:#e2e8f0;color:#1e293b;align-self:flex-start}
    .etec-user{background:#2563eb;color:#fff;align-self:flex-end;margin-left:auto}
    #etec-chat-msgs{display:flex;flex-direction:column}
    #etec-chat-inputrow{display:flex;border-top:1px solid #e2e8f0}
    #etec-chat-input{flex:1;border:none;padding:12px;outline:none;font-size:14px}
    #etec-chat-send{border:none;background:#2563eb;color:#fff;padding:0 16px;cursor:pointer}
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'etec-chat-btn';
    btn.textContent = '💬';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'etec-chat-panel';
    panel.innerHTML = `
        <div id="etec-chat-head">Etec Shop Assistant</div>
        <div id="etec-chat-msgs"></div>
        <div id="etec-chat-inputrow">
            <input id="etec-chat-input" type="text" placeholder="Ask about products, price, shipping..." />
            <button id="etec-chat-send">Send</button>
        </div>`;
    document.body.appendChild(panel);

    const msgs = panel.querySelector('#etec-chat-msgs');
    const input = panel.querySelector('#etec-chat-input');

    const addMsg = (text, who) => {
        const div = document.createElement('div');
        div.className = `etec-msg ${who === 'user' ? 'etec-user' : 'etec-bot'}`;
        div.textContent = text;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    };

    const send = () => {
        const val = input.value.trim();
        if (!val) return;
        addMsg(val, 'user');
        input.value = '';
        setTimeout(() => addMsg(reply(val), 'bot'), 300);
    };

    btn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
        if (panel.style.display === 'flex' && !msgs.children.length)
            addMsg(`Hi! I'm the ${STORE.name} assistant. Ask me about products, prices, shipping, payment, or returns.`, 'bot');
    });
    panel.querySelector('#etec-chat-send').addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

if (typeof document !== 'undefined') createChatUI();
