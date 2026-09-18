package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"nodepulse/agent/internal/collect"
	"nodepulse/agent/internal/config"
	"nodepulse/agent/internal/ws"
)

var (
	version   = "0.1.0"
	commit    = "none"
	buildDate = "unknown"
)

func main() {
	configPath := flag.String("config", "/etc/nodepulse/agent.yaml", "path to yaml config file")
	showVer := flag.Bool("v", false, "show version and exit")
	flag.Parse()

	if *showVer {
		fmt.Printf("nodepulse-agent %s (commit %s, date %s)\n", version, commit, buildDate)
		return
	}

	log.Printf("[agent] starting nodepulse-agent %s", version)

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("[agent] config error: %v", err)
	}

	collector := collect.NewCollector(cfg.Disks, cfg.NicsExclude)
	client := ws.NewClient(cfg, collector, version)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		log.Printf("[agent] received signal %v, shutting down...", sig)
		cancel()
	}()

	if err := client.Run(ctx); err != nil && err != context.Canceled {
		log.Fatalf("[agent] exited with error: %v", err)
	}
	log.Printf("[agent] stopped gracefully")
}
