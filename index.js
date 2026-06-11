// index.js
const Mustache = require("mustache");
const fs = require("fs");

const MUSTACHE_MAIN_DIR = "./main.mustache";
const VIDEOS_URL = "https://www.youtube.com/@RenatoDinisAI/videos";
const MAX_VIDEOS = 4;
const SITEMAP_URL = "https://atuals.com/sitemap.xml";
const MAX_POSTS = 3;

// A consent cookie + browser headers so the EU consent wall never hides the
// page. US CI runners don't get the wall, so this is just insurance.
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "SOCS=CAISEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg",
};

/**
 * Collect every lockupViewModel video (the "Videos" tab natively excludes
 * Shorts) in page order, newest first.
 */
function extractVideos(ytInitialData) {
  const out = [];
  const seen = new Set();
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    const lv = node.lockupViewModel;
    if (
      lv &&
      lv.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" &&
      /^[\w-]{11}$/.test(lv.contentId || "") &&
      !seen.has(lv.contentId)
    ) {
      seen.add(lv.contentId);
      let title = "";
      try {
        title = lv.metadata.lockupMetadataViewModel.title.content;
      } catch (e) {
        /* title stays empty */
      }
      out.push({
        id: lv.contentId,
        title,
        url: `https://youtu.be/${lv.contentId}`,
        thumb: `https://i.ytimg.com/vi/${lv.contentId}/hqdefault.jpg`,
      });
    }
    for (const k in node) walk(node[k]);
  })(ytInitialData);
  return out;
}

/**
 * Fetch the channel's "Videos" tab and return the latest long-form videos.
 * On any failure we return [] so the scheduled commit never breaks — the
 * template falls back to a plain "Watch on YouTube" link.
 */
async function fetchLatestVideos() {
  try {
    const res = await fetch(VIDEOS_URL, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const m = html.match(/ytInitialData\s*=\s*(\{.*?\});<\/script>/s);
    if (!m) throw new Error("ytInitialData not found");

    return extractVideos(JSON.parse(m[1])).slice(0, MAX_VIDEOS);
  } catch (err) {
    console.error("Could not fetch YouTube videos:", err.message);
    return [];
  }
}

/**
 * Title for one blog post: the page's og:title (the prerendered pages carry
 * one per post), falling back to a title-cased slug if the fetch fails.
 */
async function fetchPostTitle(url) {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
    if (m) return m[1].trim();
  } catch (e) {
    /* fall through to slug */
  }
  const slug = url.split("/").pop();
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Read /blog/<slug> entries out of the Atuals sitemap, newest lastmod first.
 * On any failure we return [] so the scheduled commit never breaks — the
 * template falls back to a plain "Read the Atuals blog" link.
 */
async function fetchLatestPosts() {
  try {
    const res = await fetch(SITEMAP_URL, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const posts = [
      ...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g),
    ]
      .filter(([, loc]) => /atuals\.com\/blog\/[^/]+$/.test(loc))
      .map(([, url, lastmod]) => ({ url, lastmod }))
      .sort((a, b) => b.lastmod.localeCompare(a.lastmod))
      .slice(0, MAX_POSTS);

    for (const post of posts) {
      post.title = await fetchPostTitle(post.url);
      post.published = new Date(post.lastmod).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return posts;
  } catch (err) {
    console.error("Could not fetch Atuals blog posts:", err.message);
    return [];
  }
}

/**
 * A - We open 'main.mustache'
 * B - We ask Mustache to render our file with the data
 * C - We create a README.md file with the generated output
 */
async function generateReadMe() {
  const DATA = {
    name: "Renato Dinis",
    date: new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      timeZoneName: "short",
      timeZone: "Europe/Lisbon",
    }),
    videos: await fetchLatestVideos(),
    posts: await fetchLatestPosts(),
  };

  const template = fs.readFileSync(MUSTACHE_MAIN_DIR).toString();
  const output = Mustache.render(template, DATA);
  fs.writeFileSync("README.md", output);
}

generateReadMe();
