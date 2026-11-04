# Render preview image: builds gherkit, runs the real `gherkit report` command on the
# sample results in render/results at start-up and serves the reports as static files.
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/gherkit ./cmd/gherkit

FROM alpine:3.20
RUN apk add --no-cache busybox-extras
COPY --from=build /out/gherkit /usr/local/bin/gherkit
COPY render/results /app/results
COPY render/entrypoint.sh render/custom.tmpl /app/
RUN chmod +x /app/entrypoint.sh
WORKDIR /app
CMD ["/app/entrypoint.sh"]
