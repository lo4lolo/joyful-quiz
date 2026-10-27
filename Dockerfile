# 즐거운 퀴즈 — 어디서나 같은 방식으로 실행 (Render, Fly.io, 학교 서버 등)
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3030
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY server ./server
COPY public ./public
EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3030/api/info || exit 1
USER node
CMD ["node", "server.js"]
