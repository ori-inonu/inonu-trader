FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY web/package.json web/bun.lock ./web/
RUN cd web && bun install --frozen-lockfile
COPY src ./src
COPY web/src ./web/src
COPY web/next.config.ts web/tsconfig.json ./web/
ENV INONU_EXPORT=1 INONU_EXPORT_DIR=out NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_INONU_CLOUD=1 NEXT_TELEMETRY_DISABLED=1
RUN cd web && bun run build

FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY --from=build /app/web/out ./web/out
RUN mkdir -p /var/lib/inonu && chown bun:bun /var/lib/inonu && chmod 700 /var/lib/inonu
ENV NODE_ENV=production INONU_DATA_DIR=/var/lib/inonu INONU_WEB_DIR=/app/web/out
USER bun
CMD ["bun", "--no-env-file", "run", "src/server/cloud-main.ts"]
