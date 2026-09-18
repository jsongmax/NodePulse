package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"nodepulse/agent/internal/collect"
	"nodepulse/agent/internal/config"
	"nodepulse/agent/internal/proto"

	"github.com/coder/websocket"
)

func TestClientHandshake(t *testing.T) {
	origDev := config.AllowInsecureWS
	config.AllowInsecureWS = true
	defer func() { config.AllowInsecureWS = origDev }()

	helloReceived := make(chan proto.AgentHello, 1)

	// Mock Hub WS server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer np1.srvtest12345.secretabcdef123456" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		// Read hello
		_, msg, err := conn.Read(context.Background())
		if err != nil {
			return
		}
		var hello proto.AgentHello
		_ = json.Unmarshal(msg, &hello)
		helloReceived <- hello

		// Send welcome
		welcome := proto.HubWelcome{
			T:             "welcome",
			ServerID:      "srvtest12345",
			Name:          "Test Server",
			Interval:      1,
			BucketMinutes: 1,
			NowMS:         time.Now().UnixMilli(),
			MaxBytes:      16384,
		}
		welcomeBytes, _ := json.Marshal(welcome)
		_ = conn.Write(context.Background(), websocket.MessageText, welcomeBytes)

		// Read at least 1 sample, then close
		_, sampleBytes, err := conn.Read(context.Background())
		if err != nil {
			return
		}
		var s proto.AgentSample
		_ = json.Unmarshal(sampleBytes, &s)
		if s.T != "s" {
			t.Errorf("expected sample message, got %s", s.T)
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	cfg := &config.Config{
		Hub:      wsURL,
		Token:    "np1.srvtest12345.secretabcdef123456",
		Interval: 1,
		Disks:    []string{"/"},
	}

	collector := collect.NewCollector(cfg.Disks, nil)
	client := NewClient(cfg, collector, "1.0.0-test")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	doneCh := make(chan error, 1)
	go func() {
		doneCh <- client.connectAndServe(ctx)
	}()

	select {
	case hello := <-helloReceived:
		if hello.T != "hello" {
			t.Errorf("expected t='hello', got %s", hello.T)
		}
		if hello.Agent != "1.0.0-test" {
			t.Errorf("expected agent '1.0.0-test', got %s", hello.Agent)
		}
		if hello.Host.Hostname == "" {
			t.Errorf("expected non-empty hostname in hello")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for hello")
	}

	<-doneCh
}
