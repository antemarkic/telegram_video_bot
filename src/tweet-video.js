// Link na tweet -> skini video(e) iz tweeta -> spremi na Dropbox.
// Video URL-ove dohvaćamo preko javnog FxTwitter API-ja (bez X API ključa i bez yt-dlp-a).
import { log } from './log.js';
import { exists, shareLink, upload } from './dropbox.js';

export const TWEET_URL = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx)\.com\/(\w+)\/status(?:es)?\/(\d+)/i;
// "folder /memes", "save as /memes" ili "spremi /memes" bira podfolder (traži se izvan URL-ova)
const FOLDER_KEYWORD = /(?:^|\s)(?:folder|save as|spremi)\s+(\/\S*)/i;
// "opet" (izvan URL-a) = spremi ponovno iako video već postoji
const FORCE = /(?:^|\s)opet(?:\s|$)/i;

const withoutUrls = (text) => text.replace(/https?:\/\/\S+/g, ' ');

// Zadano <DROPBOX_FOLDER>/YYYY-MM/ (mjesec po TIMEZONE), s ključnom riječi <DROPBOX_FOLDER>/<path>
function folder(text) {
  const base = (process.env.DROPBOX_FOLDER || '/twitter_videos').replace(/\/$/, '');
  const custom = withoutUrls(text).match(FOLDER_KEYWORD)?.[1];
  const parts = custom?.split('/').filter((p) => p && p !== '.' && p !== '..');
  if (parts?.length) return `${base}/${parts.join('/')}`;
  const month = new Date().toLocaleDateString('sv-SE', { timeZone: process.env.TIMEZONE || 'Europe/Zagreb' }).slice(0, 7);
  return `${base}/${month}`;
}

// Prvo slobodno ime: video-copy01.mp4, video-copy02.mp4...
async function freePath(base) {
  for (let n = 1; ; n++) {
    const path = `${base}-copy${String(n).padStart(2, '0')}.mp4`;
    if (!(await exists(path))) return path;
  }
}

// Link za izravni download umjesto Dropbox preview stranice
const directLink = (url) => {
  const u = new URL(url);
  u.searchParams.set('dl', '1');
  return u.toString();
};

async function fetchTweet(user, id) {
  log('twitter', `→ GET fxtwitter ${user}/${id}`);
  const res = await fetch(`https://api.fxtwitter.com/${user}/status/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`FxTwitter ${res.status}: ${await res.text()}`);
  // Za nepostojeći tweet ponekad vrati HTML stranicu umjesto JSON-a
  const tweet = await res.json().then((d) => d.tweet, () => null);
  if (!tweet) return null;
  // Gifovi su na Twitteru zapravo mp4, pa ih uzimamo zajedno s videima
  const videos = (tweet.media?.all ?? []).filter((m) => m.type === 'video' || m.type === 'gif');
  log('twitter', `← @${tweet.author.screen_name}: ${videos.length} video(a)`);
  return { author: tweet.author.screen_name, videos };
}

async function download(url) {
  log('twitter', `→ download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Obradi poruku s linkom na tweet i vrati tekst odgovora. */
export async function saveTweetVideos(text) {
  const m = text.match(TWEET_URL);
  if (!m) return 'Pošalji mi link na tweet (x.com/.../status/...).';
  const [, user, id] = m;

  const tweet = await fetchTweet(user, id);
  if (!tweet) return 'Ne mogu dohvatiti taj tweet. Možda je obrisan ili je račun zaključan.';
  if (!tweet.videos.length) return 'U tom tweetu nema videa.';

  const dir = folder(text);
  const force = FORCE.test(withoutUrls(text));
  const links = [];
  let reused = 0;
  for (const [i, v] of tweet.videos.entries()) {
    const base = `${dir}/${tweet.author}_${id}${tweet.videos.length > 1 ? `_${i + 1}` : ''}`;
    let path = `${base}.mp4`;
    if (await exists(path)) {
      if (!force) {
        log('dropbox', `već postoji: ${path}`);
        links.push(directLink(await shareLink(path)));
        reused++;
        continue;
      }
      path = await freePath(base);
    }
    const meta = await upload(path, await download(v.url));
    links.push(directLink(await shareLink(meta.path_lower)));
  }

  const head = reused === tweet.videos.length
    ? 'Video je već na Dropboxu, šaljem postojeći link. Za ponovni upload pošalji link opet uz riječ "opet".'
    : `Spremljeno na Dropbox u ${dir}:`;
  return `${head}\n\n${links.join('\n')}`;
}
