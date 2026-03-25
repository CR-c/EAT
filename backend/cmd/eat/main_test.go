package main

import "testing"

func TestResolveListenAddrDefaultsToNodeCompatibleHostPort(t *testing.T) {
	t.Setenv("EAT_BACKEND_ADDR", "")
	t.Setenv("HOST", "")
	t.Setenv("PORT", "")

	if got := resolveListenAddr(); got != "127.0.0.1:3000" {
		t.Fatalf("unexpected default listen addr: %s", got)
	}
}

func TestResolveListenAddrHonorsHostAndPortWhenBackendAddrMissing(t *testing.T) {
	t.Setenv("EAT_BACKEND_ADDR", "")
	t.Setenv("HOST", "0.0.0.0")
	t.Setenv("PORT", "4173")

	if got := resolveListenAddr(); got != "0.0.0.0:4173" {
		t.Fatalf("unexpected host/port listen addr: %s", got)
	}
}

func TestResolveListenAddrPrefersExplicitBackendAddr(t *testing.T) {
	t.Setenv("EAT_BACKEND_ADDR", ":8088")
	t.Setenv("HOST", "0.0.0.0")
	t.Setenv("PORT", "4173")

	if got := resolveListenAddr(); got != ":8088" {
		t.Fatalf("unexpected explicit backend addr: %s", got)
	}
}
