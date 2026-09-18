package collect

import (
	"context"
	"testing"
	"time"
)

func TestCollectStaticHost(t *testing.T) {
	c := NewCollector([]string{"/"}, []string{"lo"})
	hostInfo, err := c.CollectStaticHost()
	if err != nil {
		t.Fatalf("CollectStaticHost failed: %v", err)
	}

	if hostInfo.Hostname == "" {
		t.Error("expected non-empty hostname")
	}
	if hostInfo.OS == "" {
		t.Error("expected non-empty OS")
	}
	if hostInfo.CPUCores < 1 {
		t.Errorf("expected at least 1 core, got %d", hostInfo.CPUCores)
	}
	if hostInfo.BootTS <= 0 {
		t.Errorf("expected positive boot_ts, got %d", hostInfo.BootTS)
	}
}

func TestCollectSample(t *testing.T) {
	c := NewCollector([]string{"/"}, []string{"lo", "docker"})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	s, err := c.CollectSample(ctx)
	if err != nil {
		t.Fatalf("CollectSample failed: %v", err)
	}

	if s.T != "s" {
		t.Errorf("expected t='s', got %s", s.T)
	}
	if s.TS <= 0 {
		t.Errorf("expected positive ts, got %d", s.TS)
	}
	if s.CPU < 0 || s.CPU > 100 {
		t.Errorf("cpu out of bounds [0, 100]: %f", s.CPU)
	}
	if len(s.Dsk) == 0 {
		t.Error("expected at least one disk sample")
	}
	if s.Up <= 0 {
		t.Errorf("expected positive uptime, got %f", s.Up)
	}
}

func TestNICExclusion(t *testing.T) {
	c := NewCollector([]string{"/"}, []string{"lo", "docker", "veth"})
	if !c.isExcludedNIC("lo0") {
		t.Error("expected lo0 to be excluded")
	}
	if !c.isExcludedNIC("docker0") {
		t.Error("expected docker0 to be excluded")
	}
	if !c.isExcludedNIC("veth1234") {
		t.Error("expected veth1234 to be excluded")
	}
	if c.isExcludedNIC("eth0") {
		t.Error("expected eth0 NOT to be excluded")
	}
	if c.isExcludedNIC("enp3s0") {
		t.Error("expected enp3s0 NOT to be excluded")
	}
}
