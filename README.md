# video_downloader

Telegram bot: pošalješ link na tweet, on skine video(e) i GIF-ove, spremi ih na Dropbox i vrati link za izravni download.

- Video URL-ove dohvaća preko javnog [FxTwitter API-ja](https://github.com/FixTweet/FxTwitter) (bez X API ključa i bez yt-dlp-a)
- Telegram preko long pollinga, pa ne treba webhook, domena ni otvoreni port
- Nema npm ovisnosti, treba samo Node >= 20.6
- Odgovara samo vlasniku (`TELEGRAM_OWNER_ID`), ostale poruke ignorira

## Postavljanje

1. Napravi bota kod [@BotFather](https://t.me/BotFather) i kopiraj token
2. Napravi Dropbox app na [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) s dozvolama `files.content.write`, `files.metadata.read` i `sharing.write`
3. `cp .env.example .env` i upiši `TELEGRAM_BOT_TOKEN`, `DROPBOX_APP_KEY` i `DROPBOX_APP_SECRET`
4. Dropbox refresh token (ne istječe):
   ```sh
   npm run dropbox-auth          # ispiše link, otvori ga i klikni Allow
   npm run dropbox-auth <kod>    # upiše DROPBOX_REFRESH_TOKEN u .env
   ```
5. `npm start`, pošalji botu poruku i upiši ID koji se ispiše u logu kao `TELEGRAM_OWNER_ID`. ID je vezan uz tvoj Telegram račun, pa je isti za svakog bota

## Korištenje

| Poruka | Rezultat |
| --- | --- |
| `https://x.com/user/status/123` | `<DROPBOX_FOLDER>/YYYY-MM/user_123.mp4` |
| `https://x.com/... folder /memes` (ili `spremi`, `save as`) | `<DROPBOX_FOLDER>/memes/user_123.mp4` |
| `https://x.com/... opet` | ponovni upload iako već postoji (`user_123-copy01.mp4`, ...) |

Prepoznaje linkove s `x.com`, `twitter.com`, `fxtwitter.com`, `vxtwitter.com` i `fixupx.com`. Ako tweet ima više videa, dobivaju sufiks `_1`, `_2`... Ako je video već spremljen, bot vraća postojeći link umjesto novog uploada.

## Konfiguracija (`.env`)

| Varijabla | Opis |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | token od @BotFathera |
| `TELEGRAM_OWNER_ID` | tvoj Telegram user ID |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | iz Dropbox app konzole |
| `DROPBOX_REFRESH_TOKEN` | iz `npm run dropbox-auth` |
| `DROPBOX_FOLDER` | opcionalno, zadano `/twitter_videos` |
| `TIMEZONE` | opcionalno, za mjesečne foldere, zadano `Europe/Zagreb` |
| `LOG_MAX` | opcionalno, maksimalna duljina log linije, zadano 400 |

## Deploy na server

- Prebaci `.env` (npr. `scp`) i zaključaj ga s `chmod 600 .env`. `dropbox-auth` ne treba ponovno pokretati
- Pokreni s `npm start` pod systemd-om (ili pm2) da se bot sam podigne nakon restarta
- Bot s istim tokenom smije raditi samo na jednom mjestu. Telegram ne dopušta dva istovremena `getUpdates`, pa ugasi lokalnu instancu

## Struktura

```
src/index.js         Telegram bot (long polling)
src/tweet-video.js   tweet -> FxTwitter -> download -> Dropbox
src/dropbox.js       Dropbox API (refresh token, chunked upload, share link)
src/log.js           terminalski log
scripts/dropbox-auth.js
```
