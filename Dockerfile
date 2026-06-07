# scout — single self-contained Go binary (the PWA is embedded via go:embed).
# Built for the shared edge: serves the UI + /api on :8765, reads the brain on
# the internal docker network, keeps its working set in local SQLite on a volume
# (never the brain/Postgres). Auth lives at the edge — scout holds no login code.
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# modernc.org/sqlite is pure Go, so CGO is off. internal/web/dist/ is committed
# and embedded by go:embed — no npm at image-build time.
RUN CGO_ENABLED=0 go build -trimpath -o /out/scout ./cmd/scout

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/scout /usr/local/bin/scout
# Criteria fallback + pre-filter rules + playbook (the live DB is on /data).
COPY taste.md taste.toml playbook.md ./
RUN mkdir -p /data
EXPOSE 8765
# Serve on :8765; reach the brain at http://brain:8100 on brainnet; DB on the volume.
CMD ["scout","serve","--addr",":8765","--db","/data/scout.db","--brainbot","http://brain:8100"]
