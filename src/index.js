// Telegram bot preko long pollinga (bez webhooka/ngroka): link na tweet -> video na Dropbox.
import { log } from './log.js';
import { saveTweetVideos, TWEET_URL } from './tweet-video.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Nedostaje TELEGRAM_BOT_TOKEN u .env (dobiješ ga od @BotFather).');
const ownerId = process.env.TELEGRAM_OWNER_ID?.trim();

const HELP = 'Pošalji link na tweet i spremit ću video na Dropbox.\n'
  + '"folder /putanja" uz link sprema u drugi podfolder, "opet" ponovno uploada postojeći video.';

const api = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
};

// Telegram limit je 4096 znakova po poruci
const send = async (chatId, text) => {
  log('output', text);
  for (let i = 0; i < text.length; i += 4000) {
    await api('sendMessage', { chat_id: chatId, text: text.slice(i, i + 4000) });
  }
};

const me = await api('getMe', {});
console.log(`Telegram bot @${me.username} sluša.`);
if (!ownerId) console.warn('TELEGRAM_OWNER_ID nije postavljen: pošalji botu poruku, ID će se ispisati ovdje.');

let offset = 0;
while (true) {
  let updates;
  try {
    updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
  } catch (err) {
    console.error(err.message);
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }

  for (const u of updates) {
    offset = u.update_id + 1;
    const msg = u.message;
    if (!msg) continue;
    const from = String(msg.from.id);

    if (from !== ownerId) {
      console.warn(`Ignoriram poruku od ${from} (@${msg.from.username ?? '?'}). Za vlasnika postavi TELEGRAM_OWNER_ID=${from}`);
      continue;
    }
    const text = msg.text?.trim();
    log('message', text ?? '[nije tekst]');
    if (!text || !TWEET_URL.test(text)) {
      await send(from, HELP);
      continue;
    }

    api('sendChatAction', { chat_id: from, action: 'upload_video' }).catch(() => {});
    try {
      await send(from, await saveTweetVideos(text));
    } catch (err) {
      console.error('Greška u obradi poruke:', err);
      await send(from, 'Nešto je puklo na mojoj strani. Detalji su u logu.').catch(() => {});
    }
  }
}
