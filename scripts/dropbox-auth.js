// Jednokratno dohvaća Dropbox refresh token (ne istječe) i upisuje ga u .env.
// 1) npm run dropbox-auth          -> ispiše link, otvori ga i klikni Allow
// 2) npm run dropbox-auth <kod>    -> zamijeni kod za refresh token i spremi u .env
import { readFile, writeFile } from 'node:fs/promises';

const { DROPBOX_APP_KEY: key, DROPBOX_APP_SECRET: secret } = process.env;
if (!key || !secret) throw new Error('Nedostaju DROPBOX_APP_KEY i DROPBOX_APP_SECRET u .env');

const code = process.argv[2]?.trim();
if (!code) {
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: key, response_type: 'code', token_access_type: 'offline' });
  console.log(`Otvori, klikni Allow i kopiraj kod:\n\n${url}\n\nZatim: npm run dropbox-auth <kod>`);
  process.exit(0);
}

const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
  method: 'POST',
  body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: key, client_secret: secret }),
});
if (!res.ok) throw new Error(`Dropbox token ${res.status}: ${await res.text()}`);
const { refresh_token } = await res.json();
if (!refresh_token) throw new Error('Dropbox nije vratio refresh token');

const envFile = new URL('../.env', import.meta.url);
const env = await readFile(envFile, 'utf8');
const line = `DROPBOX_REFRESH_TOKEN=${refresh_token}`;
await writeFile(
  envFile,
  /^DROPBOX_REFRESH_TOKEN=.*$/m.test(env) ? env.replace(/^DROPBOX_REFRESH_TOKEN=.*$/m, line) : `${env.trimEnd()}\n${line}\n`,
);
console.log('Refresh token spremljen u .env. Restartaj bota.');
