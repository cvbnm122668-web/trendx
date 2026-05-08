const express = require('express');
const axios = require('axios');
const RSSParser = require('rss-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const parser = new RSSParser({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NewsFetcher/1.0)',
  },
  customFields: {
    item: ['media:content', 'enclosure', 'media:thumbnail'],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── RSS Sources ────────────────────────────────────────────────────────────
const RSS_SOURCES = {
  tech: [
    { name: 'TechCrunch',    url: 'https://techcrunch.com/feed/', category: 'tech' },
    { name: 'The Verge',     url: 'https://www.theverge.com/rss/index.xml', category: 'tech' },
    { name: 'Wired',         url: 'https://www.wired.com/feed/rss', category: 'tech' },
    { name: 'Ars Technica',  url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'tech' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', category: 'tech' },
  ],
  world: [
    { name: 'BBC World',     url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'world' },
    { name: 'Al Jazeera',   url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'world' },
    { name: 'NPR News',     url: 'https://feeds.npr.org/1001/rss.xml', category: 'world' },
    { name: 'Reuters',      url: 'https://feeds.reuters.com/reuters/topNews', category: 'world' },
    { name: 'Guardian',     url: 'https://www.theguardian.com/world/rss', category: 'world' },
  ],
  business: [
    { name: 'CNBC',         url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'business' },
    { name: 'MarketWatch',  url: 'https://feeds.marketwatch.com/marketwatch/topstories/', category: 'business' },
    { name: 'Forbes',       url: 'https://www.forbes.com/innovation/feed2', category: 'business' },
    { name: 'Bloomberg',    url: 'https://feeds.bloomberg.com/markets/news.rss', category: 'business' },
    { name: 'Inc.',         url: 'https://www.inc.com/rss/', category: 'business' },
  ],
};

// ─── Hacker News (free API) ──────────────────────────────────────────────────
async function fetchHackerNews(limit = 20) {
  try {
    const topRes = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 6000 });
    const ids = topRes.data.slice(0, 30);
    const stories = await Promise.all(
      ids.map(id =>
        axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 })
          .then(r => r.data)
          .catch(() => null)
      )
    );
    return stories
      .filter(s => s && s.title && s.url && s.score >= 50)
      .slice(0, limit)
      .map(s => ({
        id: `hn-${s.id}`,
        title: s.title,
        url: s.url,
        source: 'Hacker News',
        category: 'tech',
        pubDate: new Date(s.time * 1000).toISOString(),
        summary: `${s.score} points · ${s.descendants || 0} comments on HN`,
        score: s.score,
        comments: s.descendants || 0,
        type: 'hn',
      }));
  } catch (e) {
    console.error('HN fetch error:', e.message);
    return [];
  }
}

// ─── Reddit (free, no auth for public JSON) ──────────────────────────────────
const REDDIT_SUBS = {
  tech:     ['technology', 'artificial', 'programming', 'MachineLearning'],
  world:    ['worldnews', 'news', 'geopolitics'],
  business: ['investing', 'Economics', 'business', 'stocks'],
};

async function fetchReddit(categories = ['tech', 'world', 'business'], limit = 10) {
  const results = [];
  const subs = [...new Set(categories.flatMap(c => REDDIT_SUBS[c] || []))];
  for (const sub of subs.slice(0, 4)) {
    try {
      const res = await axios.get(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        timeout: 7000,
        headers: { 'User-Agent': 'TrendingNewsApp/1.0' },
      });
      const posts = res.data?.data?.children || [];
      posts.forEach(p => {
        const d = p.data;
        if (!d.title || d.is_self || d.over_18) return;
        const cat = REDDIT_SUBS.tech.includes(sub) ? 'tech'
                  : REDDIT_SUBS.world.includes(sub) ? 'world'
                  : 'business';
        results.push({
          id: `reddit-${d.id}`,
          title: d.title,
          url: d.url,
          source: `Reddit r/${sub}`,
          category: cat,
          pubDate: new Date(d.created_utc * 1000).toISOString(),
          summary: `${d.score} upvotes · ${d.num_comments} comments`,
          score: d.score,
          comments: d.num_comments,
          type: 'reddit',
        });
      });
    } catch (e) {
      console.error(`Reddit r/${sub} error:`, e.message);
    }
  }
  return results.slice(0, limit);
}

// ─── RSS Fetch ───────────────────────────────────────────────────────────────
async function fetchRSS(source) {
  try {
    const feed = await parser.parseURL(source.url);
    return (feed.items || []).slice(0, 10).map((item, i) => ({
      id: `rss-${source.name}-${i}`,
      title: (item.title || '').trim(),
      url: item.link || item.guid || '',
      source: source.name,
      category: source.category,
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      summary: stripHtml(item.contentSnippet || item.summary || item.content || '').slice(0, 180),
      score: scoreByRecency(item.pubDate || item.isoDate),
      type: 'rss',
    }));
  } catch (e) {
    console.error(`RSS error [${source.name}]:`, e.message);
    return [];
  }
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function scoreByRecency(dateStr) {
  if (!dateStr) return 10;
  const age = (Date.now() - new Date(dateStr).getTime()) / 3600000; // hours
  if (age < 1) return 100;
  if (age < 3) return 80;
  if (age < 6) return 60;
  if (age < 12) return 40;
  if (age < 24) return 20;
  return 5;
}

// ─── Trending Score ──────────────────────────────────────────────────────────
function computeTrendScore(item) {
  let score = item.score || 0;
  // Boost by engagement
  if (item.comments) score += item.comments * 0.5;
  // Boost by recency
  score += scoreByRecency(item.pubDate);
  // Keyword boosts
  const title = (item.title || '').toLowerCase();
  const hotWords = ['ai', 'breaking', 'launch', 'record', 'crash', 'war', 'deal',
    'billion', 'ban', 'leak', 'hack', 'ipo', 'gpt', 'gemini', 'elon', 'trump',
    'fed', 'apple', 'google', 'openai', 'nvidia', 'bitcoin', 'crisis'];
  hotWords.forEach(w => { if (title.includes(w)) score += 15; });
  return Math.round(score);
}

// ─── X Post Generator ────────────────────────────────────────────────────────
const TECH_TAGS    = ['#Tech', '#AI', '#Innovation', '#TechNews', '#Digital', '#Startup', '#Software'];
const WORLD_TAGS   = ['#WorldNews', '#BreakingNews', '#Global', '#International', '#News', '#Politics'];
const BIZ_TAGS     = ['#Business', '#Economy', '#Finance', '#Markets', '#Investing', '#Stocks'];
const EMOJIS_TECH  = ['🚀', '💡', '🤖', '🔥', '⚡', '🧠', '💻', '📱', '🔬', '🌐'];
const EMOJIS_WORLD = ['🌍', '🔴', '📰', '⚡', '🚨', '🌏', '📡', '🗺️', '🔔', '🌐'];
const EMOJIS_BIZ   = ['📈', '💰', '🏦', '💼', '📊', '🤝', '💵', '⚡', '🔑', '🏆'];

const TEMPLATES = [
  (title, tags, emoji) => `${emoji} ${title}\n\n${tags.slice(0,3).join(' ')}`,
  (title, tags, emoji) => `${emoji} TRENDING: ${title}\n\n${tags.slice(0,2).join(' ')} #Trending`,
  (title, tags, emoji) => `Just in 👇\n\n${title}\n\n${tags.slice(0,3).join(' ')}`,
  (title, tags, emoji) => `${emoji} You need to know this:\n\n"${title}"\n\n${tags.slice(0,2).join(' ')}`,
  (title, tags, emoji) => `Breaking ${emoji}\n\n${title}\n\n${tags.slice(0,3).join(' ')}`,
  (title, tags, emoji) => `🧵 What's happening:\n\n${title}\n\n${tags.slice(0,2).join(' ')}`,
  (title, tags, emoji) => `${emoji} This is big:\n\n${title}\n\n${tags.slice(0,2).join(' ')} #MustRead`,
  (title, tags, emoji) => `Hot take ${emoji}\n\n${title}\n\n${tags.slice(0,3).join(' ')}`,
  (title, tags, emoji) => `📌 Save this:\n\n${title}\n\n${tags.slice(0,3).join(' ')}`,
  (title, tags, emoji) => `${emoji} Heads up:\n\n${title}\n\nWhat do you think? ${tags.slice(0,2).join(' ')}`,
];

function generateXPost(article, index) {
  const cat = article.category;
  const tags  = cat === 'tech' ? TECH_TAGS : cat === 'world' ? WORLD_TAGS : BIZ_TAGS;
  const emojis = cat === 'tech' ? EMOJIS_TECH : cat === 'world' ? EMOJIS_WORLD : EMOJIS_BIZ;
  const emoji = emojis[index % emojis.length];
  const tagSet = [tags[index % tags.length], tags[(index + 1) % tags.length], tags[(index + 2) % tags.length]];
  const template = TEMPLATES[index % TEMPLATES.length];

  // Clean title
  let title = article.title
    .replace(/\s*[\|\-–—]\s*(TechCrunch|The Verge|Wired|BBC|Reuters|CNBC|Forbes|Guardian|Al Jazeera|NPR|MarketWatch|Bloomberg|Inc\.|Ars Technica).*$/i, '')
    .trim();
  if (title.length > 200) title = title.slice(0, 197) + '...';

  let post = template(title, tagSet, emoji);
  // Enforce 280 char limit
  if (post.length > 280) {
    const shortTitle = title.slice(0, 150) + '...';
    post = template(shortTitle, tagSet.slice(0, 2), emoji);
  }
  if (post.length > 280) post = post.slice(0, 277) + '...';
  return post;
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// Fetch & filter news
app.get('/api/news', async (req, res) => {
  const cats = (req.query.categories || 'tech,world,business').split(',');
  const keyword = (req.query.keyword || '').toLowerCase().trim();
  const sortBy = req.query.sortBy || 'trending'; // trending | recency | source
  const limit = parseInt(req.query.limit) || 60;

  console.log(`[News] cats=${cats.join(',')} keyword="${keyword}" sort=${sortBy}`);

  // Gather sources
  const rssSources = cats.flatMap(c => RSS_SOURCES[c] || []);
  const rssPromises = rssSources.map(s => fetchRSS(s));
  const hnPromise   = cats.includes('tech') ? fetchHackerNews(20) : Promise.resolve([]);
  const rdPromise   = fetchReddit(cats, 20);

  const [rssResults, hnItems, rdItems] = await Promise.all([
    Promise.all(rssPromises),
    hnPromise,
    rdPromise,
  ]);

  let allItems = [...rssResults.flat(), ...hnItems, ...rdItems];

  // Deduplicate by title similarity
  const seen = new Set();
  allItems = allItems.filter(item => {
    if (!item.title || !item.url) return false;
    const key = item.title.slice(0, 60).toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Keyword filter
  if (keyword) {
    allItems = allItems.filter(item =>
      item.title.toLowerCase().includes(keyword) ||
      (item.summary || '').toLowerCase().includes(keyword)
    );
  }

  // Category filter
  allItems = allItems.filter(item => cats.includes(item.category));

  // Compute trend scores
  allItems = allItems.map(item => ({ ...item, trendScore: computeTrendScore(item) }));

  // Sort
  if (sortBy === 'trending') {
    allItems.sort((a, b) => b.trendScore - a.trendScore);
  } else if (sortBy === 'recency') {
    allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  } else if (sortBy === 'source') {
    allItems.sort((a, b) => a.source.localeCompare(b.source));
  }

  const total = allItems.length;
  allItems = allItems.slice(0, limit);

  res.json({ success: true, total, count: allItems.length, items: allItems });
});

// Generate X posts from selected articles
app.post('/api/generate-posts', (req, res) => {
  const { articles } = req.body;
  if (!articles || !Array.isArray(articles)) {
    return res.status(400).json({ success: false, error: 'articles array required' });
  }
  const selected = articles.slice(0, 40);
  const posts = selected.map((article, i) => ({
    id: article.id,
    articleTitle: article.title,
    articleUrl: article.url,
    category: article.category,
    source: article.source,
    post: generateXPost(article, i),
    charCount: 0,
  }));
  posts.forEach(p => { p.charCount = p.post.length; });
  res.json({ success: true, count: posts.length, posts });
});

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3721;
app.listen(PORT, () => {
  console.log(`\n✅  Trending News X App running → http://localhost:${PORT}\n`);
});
