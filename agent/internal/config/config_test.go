package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.Interval != 10 {
		t.Fatalf("expected interval 10, got %d", cfg.Interval)
	}
	if len(cfg.Disks) != 1 || cfg.Disks[0] != "/" {
		t.Fatalf("expected default disk '/', got %v", cfg.Disks)
	}
}

func TestValidateConfig(t *testing.T) {
	// 1. Missing hub
	cfg := DefaultConfig()
	cfg.Token = "np1.srv123456789.secretabcdef123456"
	if err := ValidateConfig(&cfg); err == nil {
		t.Fatal("expected error on missing hub")
	}

	// 2. Insecure ws:// in prod mode
	origDev := AllowInsecureWS
	AllowInsecureWS = false
	defer func() { AllowInsecureWS = origDev }()

	cfg.Hub = "ws://status.example.com/ws/agent"
	if err := ValidateConfig(&cfg); err == nil {
		t.Fatal("expected error on ws:// when AllowInsecureWS is false")
	}

	// 3. Valid wss://
	cfg.Hub = "wss://status.example.com/ws/agent"
	if err := ValidateConfig(&cfg); err != nil {
		t.Fatalf("unexpected error on valid config: %v", err)
	}

	// 4. Invalid token
	cfg.Token = "invalid-token"
	if err := ValidateConfig(&cfg); err == nil {
		t.Fatal("expected error on invalid token format")
	}

	cfg.Token = "np1.short.sec"
	if err := ValidateConfig(&cfg); err == nil {
		t.Fatal("expected error on short token components")
	}

	// 5. Valid token
	cfg.Token = "np1.srv123456789.secretabcdef123456"
	if err := ValidateConfig(&cfg); err != nil {
		t.Fatalf("unexpected error on valid token: %v", err)
	}

	// 6. Interval range
	cfg.Interval = 0
	if err := ValidateConfig(&cfg); err == nil {
		t.Fatal("expected error on interval 0")
	}
	cfg.Interval = 500
	if err := ValidateConfig(&cfg); err == nil {
		t.Fatal("expected error on interval > 300")
	}
}

func TestLoadConfigFileAndEnv(t *testing.T) {
	tmpDir := t.TempDir()
	confPath := filepath.Join(tmpDir, "agent.yaml")

	yamlContent := `
hub: "wss://hub.example.com/ws/agent"
token: "np1.srvfromfile12.secretfile12345678"
interval: 15
disks:
  - "/"
  - "/data"
nics_exclude:
  - "lo"
  - "tun0"
report_public_ip: true
`
	if err := os.WriteFile(confPath, []byte(yamlContent), 0600); err != nil {
		t.Fatalf("failed to write tmp config: %v", err)
	}

	cfg, err := LoadConfig(confPath)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if cfg.Hub != "wss://hub.example.com/ws/agent" {
		t.Errorf("expected hub from file, got %s", cfg.Hub)
	}
	if cfg.Interval != 15 {
		t.Errorf("expected interval 15, got %d", cfg.Interval)
	}
	if len(cfg.Disks) != 2 || cfg.Disks[1] != "/data" {
		t.Errorf("unexpected disks: %v", cfg.Disks)
	}
	if !cfg.ReportPublicIP {
		t.Errorf("expected report_public_ip true")
	}

	// Test env override
	t.Setenv("NP_INTERVAL", "25")
	t.Setenv("NP_REPORT_PUBLIC_IP", "false")
	cfg2, err := LoadConfig(confPath)
	if err != nil {
		t.Fatalf("LoadConfig with env failed: %v", err)
	}
	if cfg2.Interval != 25 {
		t.Errorf("expected env override interval 25, got %d", cfg2.Interval)
	}
	if cfg2.ReportPublicIP {
		t.Errorf("expected env override report_public_ip false")
	}
}
