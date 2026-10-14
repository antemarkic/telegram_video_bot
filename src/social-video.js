// Link na Instagram / Facebook post -> skini video(e) preko yt-dlp-a -> spremi na Dropbox.
// Za razliku od Twittera ovdje nema javnog API-ja poput FxTwittera, pa koristimo yt-dlp (+ ffmpeg za spajanje
// zasebnih audio i video streamova). Za postove koji traže prijavu postavi YTDLP_COOKIES na cookies.txt.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { log } from './log.js';
import { saveVideos } from './save.js';

export const SOCIAL_URL = /https?:\/\/(?:[\w-]+\.)*(?:instagram\.com|facebook\.com|fb\.com|fb\.watch)\/\S+/i;

const run = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024; // -J za dulje FB videe zna biti nekoliko MB

function ytdlp(args) {
  const cookies = process.env.YTDLP_COOKIES ? ['--cookies', process.env.YTDLP_COOKIES] : [];
  return run(process.env.YTDLP_PATH || 'yt-dlp', [
    '--no-warnings', '--no-progress',
    // h264 + m4a u mp4 da se video otvara svugdje (FB zna servirati VP9/AV1)
    '-f', 'bv*+ba/b', '-S', 'vcodec:h264,ext:mp4:m4a', '--merge-output-format', 'mp4',
    ...cookies, ...args,
  ], { maxBuffer: MAX_BUFFER });
}

// yt-dlp piše razlog greške u zadnju "ERROR:" liniju stderra
const reason = (err) => err.stderr?.match(/ERROR: (.+)/g)?.at(-1)?.slice(7) ?? err.message;
// Za Telegram samo prva rečenica, uz uputu ako post traži prijavu
function errorReply(err) {
  const msg = reason(err);
  const login = /cookies|log(?:ged)?[ -]?in|empty media response/i.test(msg);
  return `Ne mogu dohvatiti video: ${msg.split(/(?<=\.)\s/)[0]}`
    + (login ? '\n\nPost vjerojatno traži prijavu. Postavi YTDLP_COOKIES (upute u README-u).' : '');
}

const safe = (s) => String(s ?? '').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

async function download(info) {
  const dir = await mkdtemp(join(tmpdir(), 'video-'));
  try {
    // Ponovno korištenje već dohvaćenih metapodataka, bez novog poziva prema Instagramu / Facebooku
    await writeFile(join(dir, 'info.json'), JSON.stringify(info));
    log('ytdlp', `→ download ${info.webpage_url ?? info.id}`);
    const { stdout } = await ytdlp(['--load-info-json', join(dir, 'info.json'), '-o', join(dir, 'video.%(ext)s'), '--print', 'after_move:filepath']);
    return await readFile(stdout.trim().split('\n').at(-1));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Obradi poruku s linkom na Instagram / Facebook i vrati tekst odgovora. */
export async function saveSocialVideos(text) {
  const url = text.match(SOCIAL_URL)?.[0];
  if (!url) return 'Pošalji mi link na Instagram ili Facebook post.';
  const prefix = /instagram\.com/i.test(url) ? 'ig' : 'fb';

  log('ytdlp', `→ info ${url}`);
  let info;
  try {
    info = JSON.parse((await ytdlp(['-J', url])).stdout);
  } catch (err) {
    log('ytdlp', `← greška: ${reason(err)}`);
    return errorReply(err);
  }
  // Carousel post (više videa) dolazi kao playlist
  const videos = (info._type === 'playlist' ? info.entries ?? [] : [info]).filter(Boolean);
  // Instagram: channel = korisničko ime, Facebook: uploader = ime stranice (uploader_id je samo broj)
  const author = info.channel || info.uploader || videos[0]?.channel || videos[0]?.uploader;
  log('ytdlp', `← ${author ?? '?'}: ${videos.length} video(a)`);
  if (!videos.length) return 'U tom postu nema videa.';

  const name = [prefix, safe(author), safe(info.id)].filter(Boolean).join('_');
  return saveVideos(text, name, videos.map((v) => () => download(v)));
}
