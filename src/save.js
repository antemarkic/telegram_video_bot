// Zajedničko spremanje videa na Dropbox: folder iz poruke, preskakanje postojećih, "opet", share linkovi.
import { log } from './log.js';
import { exists, shareLink, upload } from './dropbox.js';

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

/**
 * Spremi videe na Dropbox i vrati tekst odgovora.
 * `name` je ime datoteke bez ekstenzije, `loaders` funkcije koje vraćaju Buffer videa
 * (zovu se tek kad video stvarno treba uploadati).
 */
export async function saveVideos(text, name, loaders) {
  const dir = folder(text);
  const force = FORCE.test(withoutUrls(text));
  const links = [];
  let reused = 0;
  for (const [i, load] of loaders.entries()) {
    const base = `${dir}/${name}${loaders.length > 1 ? `_${i + 1}` : ''}`;
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
    const meta = await upload(path, await load());
    links.push(directLink(await shareLink(meta.path_lower)));
  }

  const head = reused === loaders.length
    ? 'Video je već na Dropboxu, šaljem postojeći link. Za ponovni upload pošalji link opet uz riječ "opet".'
    : `Spremljeno na Dropbox u ${dir}:`;
  return `${head}\n\n${links.join('\n')}`;
}
