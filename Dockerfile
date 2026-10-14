FROM node:22-alpine

# yt-dlp (Instagram / Facebook) treba python3, ffmpeg spaja zasebne audio i video streamove.
# Instagram i Facebook često mijenjaju stranice, pa za noviji yt-dlp: docker compose build --no-cache
RUN apk add --no-cache python3 ffmpeg \
  && wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src

USER node
CMD ["node", "src/index.js"]
