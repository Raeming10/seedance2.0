FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js app.js index.html style.css ./
COPY lib ./lib
COPY docs ./docs
COPY examples ./examples
RUN mkdir -p /data/studio && chown -R node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8000 STUDIO_DATA_DIR=/data/studio
USER node
EXPOSE 8000
CMD ["node", "server.js"]
