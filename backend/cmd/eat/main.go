package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"eat/backend/internal/api"
	"eat/backend/internal/eventbus"
	"eat/backend/internal/store"
)

func main() {
	addr := resolveListenAddr()
	dbPath := envOrDefault("EAT_BACKEND_DB_PATH", filepath.Join(".eat", "eat.db"))
	uiRootPath := os.Getenv("EAT_UI_ROOT")

	db, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	bus := eventbus.New()
	handler := api.NewHandler(api.Dependencies{
		DB:         db,
		Bus:        bus,
		UIRootPath: uiRootPath,
	})

	server := &http.Server{
		Addr:              addr,
		Handler:           api.NewRouter(handler),
		ReadHeaderTimeout: 10 * time.Second,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("eat backend listening on %s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func resolveListenAddr() string {
	if addr := os.Getenv("EAT_BACKEND_ADDR"); addr != "" {
		return addr
	}

	host := envOrDefault("HOST", "127.0.0.1")
	port := envOrDefault("PORT", "3000")
	return fmt.Sprintf("%s:%s", host, port)
}
