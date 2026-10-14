# video_downloader

Telegram bot: pošalješ link na tweet, Instagram ili Facebook post, on skine video(e) i GIF-ove, spremi ih na Dropbox i vrati link za izravni download.

- Twitter video URL-ove dohvaća preko javnog [FxTwitter API-ja](https://github.com/FixTweet/FxTwitter) (bez X API ključa)
- Instagram i Facebook skida preko [yt-dlp-a](https://github.com/yt-dlp/yt-dlp) (+ ffmpeg), koji su u Docker imageu
- Telegram preko long pollinga, pa ne treba webhook, domena ni otvoreni port
- Nema npm ovisnosti, treba Node >= 20.6, a za Instagram / Facebook izvan Dockera i `yt-dlp` + `ffmpeg` u PATH-u (`brew install yt-dlp ffmpeg`)
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
| `https://www.instagram.com/reel/ABC/` | `<DROPBOX_FOLDER>/YYYY-MM/ig_user_ABC.mp4` |
| `https://www.facebook.com/.../videos/123/` | `<DROPBOX_FOLDER>/YYYY-MM/fb_Stranica_123.mp4` |

Prepoznaje linkove s `x.com`, `twitter.com`, `fxtwitter.com`, `vxtwitter.com` i `fixupx.com`, te `instagram.com`, `facebook.com`, `fb.com` i `fb.watch` (reels, postovi, videi, share linkovi). `folder` i `opet` rade isto za sve. Ako tweet ima više videa, dobivaju sufiks `_1`, `_2`... Ako je video već spremljen, bot vraća postojeći link umjesto novog uploada.

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
| `YTDLP_COOKIES` | opcionalno, putanja do `cookies.txt` za Instagram / Facebook postove koji traže prijavu |
| `YTDLP_PATH` | opcionalno, putanja do yt-dlp-a, zadano `yt-dlp` iz PATH-a |

## Instagram / Facebook i prijava

Javni FB videi rade bez prijave. Instagram anonimne zahtjeve često odbija ("empty media response", "login required"), pa mu treba cookies tvog računa:

1. U pregledniku, prijavljen na Instagram (i/ili Facebook), izvezi cookies u Netscape formatu, npr. ekstenzijom "Get cookies.txt LOCALLY", i spremi kao `cookies.txt` u root projekta
2. U `.env` dodaj `YTDLP_COOKIES=/app/cookies.txt` (lokalno bez Dockera: `YTDLP_COOKIES=./cookies.txt`)
3. U `compose.yml` odkomentiraj `volumes`, `chmod 666 cookies.txt` (yt-dlp ga osvježava) i `docker compose up -d`

`cookies.txt` daje pristup tvom računu: ne commitaj ga (u `.gitignore` je) i drži ga samo na serveru. Za skidanje je bolje koristiti sporedni račun.

Instagram i Facebook često mijenjaju stranice. Kad skidanje počne pucati, rebuildaj image za najnoviji yt-dlp: `docker compose build --no-cache && docker compose up -d`.

## Docker

```sh
docker compose up -d --build   # build i pokretanje u pozadini
docker compose logs -f         # live log
docker compose down            # gašenje
```

`.env` se ne kopira u image, nego ga compose učitava pri pokretanju (`env_file`). `npm run dropbox-auth` pokreni lokalno, izvan Dockera, jer upisuje token u `.env`.

## Deploy na server

Domena i otvoreni portovi ne trebaju (long polling), dovoljan je SSH.

```sh
# na serveru, jednom
curl -fsSL https://get.docker.com | sh

# s lokalnog računala
rsync -av --exclude node_modules ./ root@<IP>:/opt/video_downloader/
ssh root@<IP> 'cd /opt/video_downloader && chmod 600 .env && docker compose up -d --build'
```

Za ažuriranje ponovi zadnje dvije naredbe. `restart: unless-stopped` podiže bota nakon restarta servera.

Bot s istim tokenom smije raditi samo na jednom mjestu. Telegram ne dopušta dva istovremena `getUpdates`, pa ugasi lokalnu instancu.

## Struktura

```
src/index.js         Telegram bot (long polling)
src/tweet-video.js   tweet -> FxTwitter -> download
src/social-video.js  Instagram / Facebook -> yt-dlp -> download
src/save.js          spremanje na Dropbox (folder, "opet", share link)
src/dropbox.js       Dropbox API (refresh token, chunked upload, share link)
src/log.js           terminalski log
scripts/dropbox-auth.js
```
