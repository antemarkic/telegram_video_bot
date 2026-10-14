// Link na tweet -> skini video(e) iz tweeta -> spremi na Dropbox.
// Video URL-ove dohvaćamo preko javnog FxTwitter API-ja (bez X API ključa i bez yt-dlp-a).
import { log } from './log.js';
import { saveVideos } from './save.js';

export const TWEET_URL = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx)\.com\/(\w+)\/status(?:es)?\/(\d+)/i;

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

  return saveVideos(text, `${tweet.author}_${id}`, tweet.videos.map((v) => () => download(v.url)));
}
