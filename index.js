// index.js
const Mustache = require("mustache");
const fs = require("fs");
const { XMLParser } = require("fast-xml-parser");

const MUSTACHE_MAIN_DIR = "./main.mustache";
const CHANNEL_ID = "UCodwwgKWupGldvuu4qmBidA";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const MAX_VIDEOS = 4;

/**
 * Fetch the channel's RSS feed and return the latest videos.
 * On any failure we return [] so the scheduled commit never breaks
 * — the template falls back to a plain "Watch on YouTube" link.
 */
async function fetchLatestVideos() {
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: false });
    const feed = parser.parse(xml);
    const entries = feed?.feed?.entry ?? [];
    const list = Array.isArray(entries) ? entries : [entries];

    return list.slice(0, MAX_VIDEOS).map((entry) => {
      const id = entry["yt:videoId"];
      return {
        id,
        title: entry.title,
        url: `https://youtu.be/${id}`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    });
  } catch (err) {
    console.error("Could not fetch YouTube feed:", err.message);
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
