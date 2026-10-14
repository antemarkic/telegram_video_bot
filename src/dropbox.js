// Dropbox upload. Access token traje 4 sata, pa ga osvježavamo refresh tokenom
// (DROPBOX_APP_KEY + DROPBOX_APP_SECRET + DROPBOX_REFRESH_TOKEN). Za brzi test radi i samo DROPBOX_ACCESS_TOKEN.
import { log } from './log.js';

const CHUNK = 100 * 1024 * 1024; // jednokratni upload ide do 150 MB, veće šaljemo u komadima
let cached = null; // { token, expires }

async function accessToken() {
  const { DROPBOX_APP_KEY: key, DROPBOX_APP_SECRET: secret, DROPBOX_REFRESH_TOKEN: refresh } = process.env;
  if (!refresh) {
    if (process.env.DROPBOX_ACCESS_TOKEN) return process.env.DROPBOX_ACCESS_TOKEN;
    throw new Error('Nedostaje DROPBOX_REFRESH_TOKEN (ili DROPBOX_ACCESS_TOKEN) u .env');
  }
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: key, client_secret: secret }),
  });
  if (!res.ok) throw new Error(`Dropbox token ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

// Dropbox-API-Arg header smije sadržavati samo ASCII
const apiArg = (obj) => JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

async function content(endpoint, arg, body) {
  const res = await fetch(`https://content.dropboxapi.com/2/files/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Dropbox-API-Arg': apiArg(arg),
      'Content-Type': 'application/octet-stream',
    },
    body,
  });
  if (!res.ok) throw new Error(`Dropbox ${endpoint} ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Postoji li datoteka na `path`. */
export async function exists(path) {
  const res = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (res.ok) return true;
  const body = await res.text();
  if (res.status === 409 && body.includes('not_found')) return false;
  throw new Error(`Dropbox get_metadata ${res.status}: ${body}`);
}

/** Javni link na datoteku. Ako link već postoji, Dropbox vraća grešku s postojećim linkom. */
export async function shareLink(path) {
  const res = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const body = await res.text();
  const data = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const url = res.ok ? data?.url : data?.error?.shared_link_already_exists?.metadata?.url;
  if (!url) throw new Error(`Dropbox share ${res.status}: ${body}`);
  return url;
}

/** Sprema buffer na `path` (npr. "/twitter_videos/video.mp4"). Vraća metadata uploadane datoteke. */
export async function upload(path, data) {
  const commit = { path, mode: 'add', autorename: false };
  log('dropbox', `→ upload ${path} (${(data.length / 1024 / 1024).toFixed(1)} MB)`);

  let meta;
  if (data.length <= CHUNK) {
    meta = await content('upload', commit, data);
  } else {
    const { session_id } = await content('upload_session/start', {}, data.subarray(0, CHUNK));
    let offset = CHUNK;
    for (; offset + CHUNK < data.length; offset += CHUNK) {
      await content('upload_session/append_v2', { cursor: { session_id, offset } }, data.subarray(offset, offset + CHUNK));
    }
    meta = await content('upload_session/finish', { cursor: { session_id, offset }, commit }, data.subarray(offset));
  }
  log('dropbox', `← spremljeno: ${meta.path_display}`);
  return meta;
}
