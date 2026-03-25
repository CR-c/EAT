FROM golang:1.22-bookworm AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -o /out/eat-backend ./cmd/eat

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /out/eat-backend /usr/local/bin/eat-backend
CMD ["eat-backend"]
