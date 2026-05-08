/* ═══════════════════════════════════════════════════════════════════════════
   TrendX — Pure Browser App (GitHub Pages compatible)
   No backend needed. Uses:
     • Hacker News Firebase API  (direct, CORS ✅)
     • Reddit JSON API           (direct, CORS ✅)
     • rss2json.com proxy        (free, no key, CORS ✅)
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── State ──────────────────────────────────────────────────────────────── */
let allArticles   = [];
let selectedIds   = new Set();
let generatedPosts = [];
let debounceTimer  = null;

/* ─── RSS Sources ────────────────────────────────────────────────────────── */
const RSS_SOURCES = {
  tech: [
    { name: 'TechCrunch',      url: 'https://techcrunch.com/feed/',                             category: 'tech' },
    { name: 'The Verge',       url: 'https://www.theverge.com/rss/index.xml',                   category: 'tech' },
    { name: 'Wired',           url: 'https://www.wired.com/feed/rss',                           category: 'tech' },
    { name: 'Ars Technica',    url: 'https://feeds.arstechnica.com/arstechnica/index',           category: 'tech' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/',                   category: 'tech' },
  ],
  world: [
    { name: 'BBC World',       url: 'https://feeds.bbci.co.uk/news/world/rss.xml',              category: 'world' },
    { name: 'NPR News',        url: 'https://feeds.npr.org/1001/rss.xml',                       category: 'world' },
    { name: 'Al Jazeera',      url: 'https://www.aljazeera.com/xml/rss/all.xml',               category: 'world' },
    { name: 'Guardian',        url: 'https://www.theguardian.com/world/rss',                    category: 'world' },
    { name: 'DW News',         url: 'https://rss.dw.com/rdf/rss-en-all',                       category: 'world' },
  ],
  business: [
    { name: 'CNBC',            url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',    category: 'business' },
    { name: 'MarketWatch',     url: 'https://feeds.marketwatch.com/marketwatch/topstories/',    category: 'business' },
    { name: 'Investopedia',    url: 'https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headlines', category: 'business' },
    { name: 'Inc.',            url: 'https://www.inc.com/rss/',                                 category: 'business' },
    { name: 'Fast Company',    url: 'https://www.fastcompany.com/latest/rss',                   category: 'business' },
  ],
};

const REDDIT_SUBS = {
  tech:     ['technology', 'artificial', 'programming', 'MachineLearning'],
  world:    ['worldnews', 'news', 'geopolitics'],
  business: ['investing', 'Economics', 'business', 'stocks'],
};

/* ─── Init ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadNews();
});

/* ─── Debounce ───────────────────────────────────────────────────────────── */
function debounceLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => loadNews(), 600);
}

/* ─── Category toggle ────────────────────────────────────────────────────── */
function toggleCat(btn) {
  const activeCats = document.querySelectorAll('.toggle.active');
  if (activeCats.length === 1 && btn.classList.contains('active')) {
    showToast('At least one category must be selected', 'error');
    return;
  }
  btn.classList.toggle('active');
  loadNews();
}

function getActiveCats() {
  return [...document.querySelectorAll('.toggle.active')].map(b => b.dataset.cat);
}

/* ══════════════════════════════════════════════════════════════════════════
   DATA FETCHING  (all browser-side, no server needed)
   ══════════════════════════════════════════════════════════════════════════ */

/* ── RSS via rss2json.com (free proxy, no key required) ─────────────────── */
async function fetchRSSBrowser(source) {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}&count=10`;
  try {
    const res  = await fetchWithTimeout(apiUrl, {}, 9000);
    const data = await res.json();
    if (data.status !== 'ok' || !Array.isArray(data.items)) return [];
    return data.items.map((item, i) => ({
      id:       `rss-${source.name}-${i}`,
      title:    (item.title || '').trim(),
      url:      item.link || '',
      source:   source.name,
      category: source.category,
      pubDate:  item.pubDate || new Date().toISOString(),
      summary:  stripHtml(item.description || item.content || '').slice(0, 180),
      score:    scoreByRecency(item.pubDate),
      type:     'rss',
    }));
  } catch (e) {
    console.warn(`RSS [${source.name}]:`, e.message);
    return [];
  }
}

/* ── Hacker News ─────────────────────────────────────────────────────────── */
async function fetchHackerNews(limit = 20) {
  try {
    const res  = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json', {}, 8000);
    const ids  = (await res.json()).slice(0, 40);
    const raw  = await Promise.allSettled(
      ids.map(id =>
        fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 5000)
          .then(r => r.json())
      )
    );
    return raw
      .filter(r => r.status === 'fulfilled' && r.value?.title && r.value?.url && r.value.score >= 40)
      .map(r => r.value)
      .slice(0, limit)
      .map(s => ({
        id:       `hn-${s.id}`,
        title:    s.title,
        url:      s.url,
        source:   'Hacker News',
        category: 'tech',
        pubDate:  new Date(s.time * 1000).toISOString(),
        summary:  `${s.score} points · ${s.descendants || 0} comments on Hacker News`,
        score:    s.score,
        comments: s.descendants || 0,
        type:     'hn',
      }));
  } catch (e) {
    console.warn('HN error:', e.message);
    return [];
  }
}

/* ── Reddit ──────────────────────────────────────────────────────────────── */
async function fetchReddit(categories = ['tech', 'world', 'business'], limit = 15) {
  const results = [];
  const subs = [...new Set(categories.flatMap(c => REDDIT_SUBS[c] || []))].slice(0, 5);
  for (const sub of subs) {
    try {
      const res  = await fetchWithTimeout(
        `https://www.reddit.com/r/${sub}/hot.json?limit=10`,
        { headers: { 'Accept': 'application/json' } },
        8000
      );
      const data = await res.json();
      const posts = data?.data?.children || [];
      posts.forEach(p => {
        const d = p.data;
        if (!d.title || d.is_self || d.over_18 || !d.url) return;
        const cat = REDDIT_SUBS.tech.includes(sub)     ? 'tech'
                  : REDDIT_SUBS.world.includes(sub)    ? 'world'
                  : 'business';
        if (!categories.includes(cat)) return;
        results.push({
          id:       `reddit-${d.id}`,
          title:    d.title,
          url:      d.url,
          source:   `Reddit r/${sub}`,
          category: cat,
          pubDate:  new Date(d.created_utc * 1000).toISOString(),
          summary:  `${d.score} upvotes · ${d.num_comments} comments`,
          score:    d.score,
          comments: d.num_comments,
          type:     'reddit',
        });
      });
    } catch (e) {
      console.warn(`Reddit r/${sub}:`, e.message);
    }
  }
  return results.slice(0, limit);
}

/* ── Timeout wrapper ─────────────────────────────────────────────────────── */
function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function scoreByRecency(dateStr) {
  if (!dateStr) return 10;
  const age = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (age < 1)  return 100;
  if (age < 3)  return 80;
  if (age < 6)  return 60;
  if (age < 12) return 40;
  if (age < 24) return 20;
  return 5;
}

function computeTrendScore(item) {
  let score = item.score || 0;
  if (item.comments) score += item.comments * 0.5;
  score += scoreByRecency(item.pubDate);
  const title = (item.title || '').toLowerCase();
  const hotWords = ['ai', 'breaking', 'launch', 'record', 'crash', 'war', 'deal',
    'billion', 'ban', 'leak', 'hack', 'ipo', 'gpt', 'gemini', 'elon', 'trump',
    'fed', 'apple', 'google', 'openai', 'nvidia', 'bitcoin', 'crisis', 'cut',
    'layoff', 'acquire', 'merge', 'lawsuit', 'arrest', 'dead', 'attack'];
  hotWords.forEach(w => { if (title.includes(w)) score += 15; });
  return Math.round(score);
}

/* ══════════════════════════════════════════════════════════════════════════
   LOAD NEWS  (replaces /api/news backend call)
   ══════════════════════════════════════════════════════════════════════════ */
async function loadNews() {
  const cats    = getActiveCats();
  if (!cats.length) return;
  const keyword = document.getElementById('keyword').value.trim().toLowerCase();
  const sortBy  = document.getElementById('sortBy').value;

  setNewsState('loading');
  selectedIds.clear();
  updateGenerateBtn();

  // Kick off all fetches in parallel
  const rssSources   = cats.flatMap(c => RSS_SOURCES[c] || []);
  const rssPromises  = rssSources.map(s => fetchRSSBrowser(s));
  const hnPromise    = cats.includes('tech') ? fetchHackerNews(20) : Promise.resolve([]);
  const rdPromise    = fetchReddit(cats, 20);

  try {
    const [rssResults, hnItems, rdItems] = await Promise.all([
      Promise.all(rssPromises),
      hnPromise,
      rdPromise,
    ]);

    let items = [...rssResults.flat(), ...hnItems, ...rdItems];

    // Deduplicate
    const seen = new Set();
    items = items.filter(item => {
      if (!item.title || !item.url) return false;
      const key = item.title.slice(0, 60).toLowerCase().replace(/\s+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Keyword filter
    if (keyword) {
      items = items.filter(a =>
        a.title.toLowerCase().includes(keyword) ||
        (a.summary || '').toLowerCase().includes(keyword)
      );
    }

    // Category filter
    items = items.filter(a => cats.includes(a.category));

    // Trend score
    items = items.map(a => ({ ...a, trendScore: computeTrendScore(a) }));

    // Sort
    if (sortBy === 'trending') items.sort((a, b) => b.trendScore - a.trendScore);
    else if (sortBy === 'recency') items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    else if (sortBy === 'source') items.sort((a, b) => a.source.localeCompare(b.source));

    items = items.slice(0, 80);
    allArticles = items;
    renderNews(items);

    const now = new Date();
    document.getElementById('lastUpdated').textContent =
      `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  } catch (err) {
    console.error(err);
    setNewsState('error', err.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   X POST GENERATOR  (replaces /api/generate-posts backend call)
   ══════════════════════════════════════════════════════════════════════════ */
const TECH_TAGS   = ['#Tech', '#AI', '#Innovation', '#TechNews', '#Digital', '#Startup', '#Software'];
const WORLD_TAGS  = ['#WorldNews', '#BreakingNews', '#Global', '#International', '#News', '#Politics'];
const BIZ_TAGS    = ['#Business', '#Economy', '#Finance', '#Markets', '#Investing', '#Stocks'];
const EMOJIS_TECH  = ['🚀', '💡', '🤖', '🔥', '⚡', '🧠', '💻', '📱', '🔬', '🌐'];
const EMOJIS_WORLD = ['🌍', '🔴', '📰', '⚡', '🚨', '🌏', '📡', '🗺️', '🔔', '🌐'];
const EMOJIS_BIZ   = ['📈', '💰', '🏦', '💼', '📊', '🤝', '💵', '⚡', '🔑', '🏆'];

const TEMPLATES = [
  (t, tags, e) => `${e} ${t}\n\n${tags.slice(0,3).join(' ')}`,
  (t, tags, e) => `${e} TRENDING: ${t}\n\n${tags.slice(0,2).join(' ')} #Trending`,
  (t, tags, e) => `Just in 👇\n\n${t}\n\n${tags.slice(0,3).join(' ')}`,
  (t, tags, e) => `${e} You need to know this:\n\n"${t}"\n\n${tags.slice(0,2).join(' ')}`,
  (t, tags, e) => `Breaking ${e}\n\n${t}\n\n${tags.slice(0,3).join(' ')}`,
  (t, tags, e) => `🧵 What's happening:\n\n${t}\n\n${tags.slice(0,2).join(' ')}`,
  (t, tags, e) => `${e} This is big:\n\n${t}\n\n${tags.slice(0,2).join(' ')} #MustRead`,
  (t, tags, e) => `Hot take ${e}\n\n${t}\n\n${tags.slice(0,3).join(' ')}`,
  (t, tags, e) => `📌 Save this:\n\n${t}\n\n${tags.slice(0,3).join(' ')}`,
  (t, tags, e) => `${e} Heads up:\n\n${t}\n\nWhat do you think? ${tags.slice(0,2).join(' ')}`,
];

function generateXPostLocal(article, index) {
  const cat    = article.category;
  const tags   = cat === 'tech' ? TECH_TAGS : cat === 'world' ? WORLD_TAGS : BIZ_TAGS;
  const emojis = cat === 'tech' ? EMOJIS_TECH : cat === 'world' ? EMOJIS_WORLD : EMOJIS_BIZ;
  const emoji  = emojis[index % emojis.length];
  const tagSet = [tags[index % tags.length], tags[(index+1) % tags.length], tags[(index+2) % tags.length]];
  const tpl    = TEMPLATES[index % TEMPLATES.length];

  let title = (article.title || '')
    .replace(/\s*[\|\-–—]\s*(TechCrunch|The Verge|Wired|BBC|Reuters|CNBC|Forbes|Guardian|Al Jazeera|NPR|MarketWatch|Bloomberg|Inc\.|Ars Technica|Hacker News).*$/i, '')
    .trim();
  if (title.length > 200) title = title.slice(0, 197) + '...';

  let post = tpl(title, tagSet, emoji);
  if (post.length > 280) {
    post = tpl(title.slice(0, 150) + '...', tagSet.slice(0, 2), emoji);
  }
  if (post.length > 280) post = post.slice(0, 277) + '...';
  return post;
}

/* ══════════════════════════════════════════════════════════════════════════
   UI FUNCTIONS
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Render News ─────────────────────────────────────────────────────────── */
function renderNews(articles) {
  const list  = document.getElementById('newsList');
  const count = document.getElementById('newsCount');

  if (!articles.length) {
    setNewsState('empty');
    count.textContent = '0 articles';
    return;
  }

  count.textContent = `${articles.length} articles`;
  const maxScore = Math.max(...articles.map(a => a.trendScore), 1);

  list.innerHTML = articles.map((a) => `
    <div class="news-item ${selectedIds.has(a.id) ? 'selected' : ''}"
         id="ni-${CSS.escape(a.id)}"
         onclick="toggleSelect('${escapeAttr(a.id)}')">
      <div class="news-checkbox"></div>
      <div class="news-content">
        <div class="news-meta">
          <span class="news-source">${escapeHtml(a.source)}</span>
          <span class="news-cat cat-${a.category}">${catLabel(a.category)}</span>
          <span class="news-time">${timeAgo(a.pubDate)}</span>
        </div>
        <div class="news-title">${escapeHtml(a.title)}</div>
        ${a.summary ? `<div class="news-summary">${escapeHtml(a.summary)}</div>` : ''}
        <div class="trend-bar" style="width:${Math.round((a.trendScore / maxScore) * 100)}%"></div>
      </div>
      <div class="news-score">
        <span class="score-val">${a.trendScore}</span>
        <span class="score-lbl">score</span>
      </div>
    </div>
  `).join('');

  setNewsState('list');
  renderSelectionBar();
}

/* ── Selection ───────────────────────────────────────────────────────────── */
function toggleSelect(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    if (selectedIds.size >= 40) {
      showToast('Max 40 articles for post generation', 'error');
      return;
    }
    selectedIds.add(id);
  }
  const el = document.getElementById(`ni-${CSS.escape(id)}`);
  if (el) el.classList.toggle('selected', selectedIds.has(id));
  renderSelectionBar();
  updateGenerateBtn();
}

function selectAll() {
  selectedIds = new Set(allArticles.slice(0, 40).map(a => a.id));
  refreshCheckboxes();
  renderSelectionBar();
  updateGenerateBtn();
  showToast(`Selected ${selectedIds.size} articles`);
}

function selectNone() {
  selectedIds.clear();
  refreshCheckboxes();
  renderSelectionBar();
  updateGenerateBtn();
}

function selectTop40() {
  const sorted = [...allArticles].sort((a, b) => b.trendScore - a.trendScore);
  selectedIds = new Set(sorted.slice(0, 40).map(a => a.id));
  refreshCheckboxes();
  renderSelectionBar();
  updateGenerateBtn();
  showToast('Top 40 trending articles selected 🔥');
}

function refreshCheckboxes() {
  document.querySelectorAll('.news-item').forEach(el => {
    const id = el.id.replace('ni-', '');
    el.classList.toggle('selected', selectedIds.has(id));
  });
}

/* ── Selection bar ───────────────────────────────────────────────────────── */
function renderSelectionBar() {
  const panel = document.querySelector('.news-panel');
  let bar = document.getElementById('selectionBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selectionBar';
    panel.appendChild(bar);
  }
  if (selectedIds.size === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <span>✅ <strong>${selectedIds.size}</strong> article${selectedIds.size !== 1 ? 's' : ''} selected</span>
    <button class="btn btn-sm btn-ghost" onclick="selectNone()">Clear selection</button>
  `;
}

/* ── Generate button ─────────────────────────────────────────────────────── */
function updateGenerateBtn() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = selectedIds.size === 0;
  const n = selectedIds.size;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    ${n > 0 ? `Generate ${n} Post${n !== 1 ? 's' : ''}` : 'Generate Posts'}`;
}

/* ── Generate Posts ──────────────────────────────────────────────────────── */
function generatePosts() {
  if (!selectedIds.size) return;
  const articles = allArticles.filter(a => selectedIds.has(a.id)).slice(0, 40);

  document.getElementById('postsPlaceholder').classList.add('hidden');
  document.getElementById('postsList').classList.add('hidden');
  document.getElementById('postsLoading').classList.remove('hidden');

  // Small timeout to let spinner render
  setTimeout(() => {
    try {
      generatedPosts = articles.map((article, i) => {
        const post = generateXPostLocal(article, i);
        return {
          id:           article.id,
          articleTitle: article.title,
          articleUrl:   article.url,
          category:     article.category,
          source:       article.source,
          post,
          charCount:    post.length,
        };
      });

      renderPosts(generatedPosts);
      document.getElementById('postsCount').textContent = `${generatedPosts.length} / 40`;
      document.getElementById('copyAllBtn').classList.remove('hidden');
      document.getElementById('exportBtn').classList.remove('hidden');
      showToast(`✨ ${generatedPosts.length} X posts generated!`, 'success');
    } catch (err) {
      document.getElementById('postsLoading').classList.add('hidden');
      document.getElementById('postsPlaceholder').classList.remove('hidden');
      showToast('Error: ' + err.message, 'error');
    }
  }, 120);
}

/* ── Render Posts ────────────────────────────────────────────────────────── */
function renderPosts(posts) {
  document.getElementById('postsLoading').classList.add('hidden');
  const list = document.getElementById('postsList');

  list.innerHTML = posts.map((p, i) => `
    <div class="post-item" id="post-${i}">
      <div class="post-number">#${i + 1}</div>
      <div class="post-header">
        <span class="post-source-tag">
          <span class="news-cat cat-${p.category}">${catLabel(p.category)}</span>
          ${escapeHtml(p.source)}
        </span>
        <div class="post-actions">
          <button class="btn btn-icon" title="Copy" onclick="copySingle(${i})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="btn btn-icon" title="Regenerate" onclick="regenerateSingle(${i})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
          </button>
        </div>
      </div>
      <div class="post-body" id="pb-${i}" contenteditable="true" spellcheck="false"
           oninput="updateCharCount(${i})">${escapeHtml(p.post)}</div>
      <div class="post-footer">
        <span class="char-count ${charClass(p.charCount)}" id="cc-${i}">${p.charCount} / 280</span>
        <a class="post-source-link" href="${escapeAttr(p.articleUrl)}" target="_blank" rel="noopener">
          ↗ ${escapeHtml((p.articleTitle || '').slice(0, 50))}${(p.articleTitle || '').length > 50 ? '…' : ''}
        </a>
      </div>
    </div>
  `).join('');

  list.classList.remove('hidden');
  list.scrollTop = 0;
}

/* ── Post actions ────────────────────────────────────────────────────────── */
function copySingle(i) {
  const el   = document.getElementById(`pb-${i}`);
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text)
    .then(() => showToast('Copied! ✅', 'success'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied! ✅', 'success');
    });
}

function regenerateSingle(i) {
  const p = generatedPosts[i];
  const article = allArticles.find(a => a.id === p.id) || {
    title: p.articleTitle, url: p.articleUrl, category: p.category, source: p.source, id: p.id,
  };
  // Use a different template offset
  const offset = (i + 1 + Math.floor(Math.random() * TEMPLATES.length)) % TEMPLATES.length;
  const fakeArticle = { ...article };
  const newPost = generateXPostLocal({ ...fakeArticle, _templateOffset: offset }, offset);

  const el = document.getElementById(`pb-${i}`);
  el.textContent = newPost;
  generatedPosts[i].post      = newPost;
  generatedPosts[i].charCount = newPost.length;
  updateCharCount(i);
  showToast('Post refreshed 🔄');
}

function updateCharCount(i) {
  const el   = document.getElementById(`pb-${i}`);
  const ccEl = document.getElementById(`cc-${i}`);
  const len  = (el.innerText || el.textContent).length;
  ccEl.textContent = `${len} / 280`;
  ccEl.className   = `char-count ${charClass(len)}`;
}

function charClass(n) {
  if (n <= 240) return 'char-ok';
  if (n <= 280) return 'char-warn';
  return 'char-over';
}

function copyAll() {
  const texts = generatedPosts.map((_, i) => {
    const el = document.getElementById(`pb-${i}`);
    return el ? (el.innerText || el.textContent) : '';
  });
  const combined = texts.map((t, i) => `--- Post ${i+1} ---\n${t}`).join('\n\n');
  navigator.clipboard.writeText(combined)
    .then(() => showToast(`📋 All ${texts.length} posts copied!`, 'success'))
    .catch(() => showToast('Copy failed', 'error'));
}

function exportPosts() {
  const texts = generatedPosts.map((p, i) => {
    const el = document.getElementById(`pb-${i}`);
    const postText = el ? (el.innerText || el.textContent) : p.post;
    return `=== Post ${i+1} | ${p.category.toUpperCase()} | ${p.source} ===\n${postText}\n\nSource: ${p.articleUrl}`;
  });
  const content = `TRENDX - X Posts Export\nGenerated: ${new Date().toLocaleString()}\nTotal: ${texts.length}\n\n${'='.repeat(60)}\n\n${texts.join('\n\n' + '─'.repeat(60) + '\n\n')}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `trendx-posts-${Date.now()}.txt`;
  a.click();
  showToast(`💾 Exported ${texts.length} posts!`, 'success');
}

/* ── UI State ────────────────────────────────────────────────────────────── */
function setNewsState(state, msg = '') {
  document.getElementById('newsLoading').classList.toggle('hidden', state !== 'loading');
  document.getElementById('newsError').classList.toggle('hidden',   state !== 'error');
  document.getElementById('newsList').classList.toggle('hidden',    state !== 'list');
  document.getElementById('newsEmpty').classList.toggle('hidden',   state !== 'empty');
  if (state === 'error') {
    document.getElementById('newsErrorMsg').textContent = msg || 'Failed to load. Check connection.';
    document.getElementById('newsCount').textContent = 'Error';
  }
}

/* ── Toast ───────────────────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

/* ── Misc helpers ────────────────────────────────────────────────────────── */
function catLabel(cat) {
  return { tech: '💻 Tech', world: '🌍 World', business: '📈 Biz' }[cat] || cat;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
