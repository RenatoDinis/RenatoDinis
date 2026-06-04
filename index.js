// index.js
const Mustache = require("mustache");
const fs = require("fs");

const MUSTACHE_MAIN_DIR = "./main.mustache";
const VIDEOS_URL = "https://www.youtube.com/@RenatoDinisAI/videos";
const MAX_VIDEOS = 4;

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
      timeZone: "Europe/Luxembourg",
    }),
    videos: await fetchLatestVideos(),
  };

  const template = fs.readFileSync(MUSTACHE_MAIN_DIR).toString();
  const output = Mustache.render(template, DATA);
  fs.writeFileSync("README.md", output);
}

generateReadMe();
