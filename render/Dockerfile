# Render preview: builds the browser demo (scripts/build-site.sh, without the CLI downloads) and serves it with Caddy.
FROM golang:1.24-alpine AS build
RUN apk add --no-cache bash git python3 zip
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG RENDER_GIT_COMMIT=preview
RUN VERSION="preview-$(echo "$RENDER_GIT_COMMIT" | cut -c1-7)" SKIP_DOWNLOADS=1 scripts/build-site.sh /out/site

FROM caddy:2-alpine
COPY --from=build /out/site /site
COPY render/Caddyfile /etc/caddy/Caddyfile
