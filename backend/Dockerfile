FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

RUN apt-get update \
  && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

ENV SKIP_PLAYWRIGHT_INSTALL=1
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p /app/data /app/uploads/screenshots

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV UPLOADS_DIR=/app/uploads
ENV SCREENSHOTS_DIR=/app/uploads/screenshots

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
