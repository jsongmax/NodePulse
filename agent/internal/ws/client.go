package ws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"log"
	"math/rand"
	"net/http"
	"time"

	"nodepulse/agent/internal/collect"
	"nodepulse/agent/internal/config"
	"nodepulse/agent/internal/proto"

	"github.com/coder/websocket"
)

type Client struct {
	cfg       *config.Config
	collector *collect.Collector
	aggregator *collect.Aggregator
	agentVer  string
}

func NewClient(cfg *config.Config, collector *collect.Collector, agentVer string) *Client {
	return &Client{
		cfg:        cfg,
		collector:  collector,
		aggregator: collect.NewAggregator(1),
		agentVer:   agentVer,
	}
}

// Run starts the connect-reconnect loop until ctx is canceled
func (c *Client) Run(ctx context.Context) error {
	backoff := 1 * time.Second
	maxBackoff := 60 * time.Second

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		err := c.connectAndServe(ctx)
		if err == nil || errors.Is(err, context.Canceled) {
			return nil
		}

		var closeErr websocket.CloseError
		if errors.As(err, &closeErr) {
			log.Printf("[agent] connection closed with code %d: %s", closeErr.Code, closeErr.Reason)
			switch closeErr.Code {
			case 4001: // Replaced by newer connection
				log.Printf("[agent] connection replaced by another instance, backing off 30s")
				time.Sleep(30 * time.Second)
				continue
			case 4008: // Overclocked
				log.Printf("[agent] overclocked by Hub, backing off 5m")
				time.Sleep(5 * time.Minute)
				continue
			case 4401, 4403: // Invalid token or disabled server
				log.Printf("[agent] CRITICAL: authentication rejected (code %d: %s). Check NP_TOKEN! Backing off 5m", closeErr.Code, closeErr.Reason)
				time.Sleep(5 * time.Minute)
				continue
			case 1008, 1009: // Protocol validation failed / message too large
				log.Printf("[agent] protocol error (code %d: %s), backing off 60s", closeErr.Code, closeErr.Reason)
				time.Sleep(60 * time.Second)
				continue
			case 4010: // Hello not sent within 5s
				log.Printf("[agent] hello timed out, reconnecting immediately")
				backoff = 1 * time.Second
				continue
			}
		} else {
			log.Printf("[agent] connection error: %v", err)
		}

		// Exponential backoff with jitter
		jitter := time.Duration(rand.Int63n(int64(backoff / 2)))
		sleepDuration := backoff + jitter
		log.Printf("[agent] reconnecting in %v...", sleepDuration)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(sleepDuration):
		}

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func (c *Client) connectAndServe(ctx context.Context) error {
	header := http.Header{}
	header.Set("Authorization", "Bearer "+c.cfg.Token)

	opts := &websocket.DialOptions{
		HTTPHeader: header,
	}

	conn, _, err := websocket.Dial(ctx, c.cfg.Hub, opts)
	if err != nil {
		return fmt.Errorf("websocket dial failed: %w", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "agent shutting down")

	// 1. Send hello message within 5s
	hostInfo, err := c.collector.CollectStaticHost()
	if err != nil {
		return fmt.Errorf("failed to collect static host: %w", err)
	}

	var ipInfo *proto.IPInfo
	if c.cfg.ReportPublicIP {
		ipInfo = collect.GetPublicIP()
	}

	helloMsg := proto.AgentHello{
		T:     "hello",
		V:     1,
		Agent: c.agentVer,
		Host:  hostInfo,
		IP:    ipInfo,
	}

	helloBytes, err := json.Marshal(helloMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal hello: %w", err)
	}

	helloCtx, helloCancel := context.WithTimeout(ctx, 5*time.Second)
	err = conn.Write(helloCtx, websocket.MessageText, helloBytes)
	helloCancel()
	if err != nil {
		return fmt.Errorf("failed to write hello message: %w", err)
	}

	// 2. Read welcome message
	welcomeCtx, welcomeCancel := context.WithTimeout(ctx, 5*time.Second)
	_, welcomeData, err := conn.Read(welcomeCtx)
	welcomeCancel()
	if err != nil {
		return fmt.Errorf("failed to read welcome message: %w", err)
	}

	var welcome proto.HubWelcome
	if err := json.Unmarshal(welcomeData, &welcome); err != nil || welcome.T != "welcome" {
		return fmt.Errorf("invalid welcome message: %s", string(welcomeData))
	}

	log.Printf("[agent] connected to Hub as server '%s' (id: %s), interval: %ds", welcome.Name, welcome.ServerID, welcome.Interval)

	interval := c.cfg.Interval
	if welcome.Interval > 0 {
		interval = welcome.Interval
	}
	bucketMinutes := 1
	if welcome.BucketMinutes > 0 {
		bucketMinutes = welcome.BucketMinutes
	}
	c.aggregator.SetBucketMinutes(bucketMinutes)

	// Clock alignment per ARCHITECTURE §3.1
	// serverId hash jitter: hash(server_id) % 2000 ms
	hasher := fnv.New32a()
	hasher.Write([]byte(welcome.ServerID))
	jitterMs := int64(hasher.Sum32() % 2000)

	nowMs := time.Now().UnixMilli()
	clockOffsetMs := welcome.NowMS - nowMs

	// Read loop in background
	readCtx, readCancel := context.WithCancel(ctx)
	defer readCancel()

	readErrCh := make(chan error, 1)
	go func() {
		for {
			_, data, err := conn.Read(readCtx)
			if err != nil {
				readErrCh <- err
				return
			}
			var generic struct {
				T string `json:"t"`
			}
			if err := json.Unmarshal(data, &generic); err != nil {
				conn.Close(4000, "unknown message format")
				readErrCh <- fmt.Errorf("invalid json from hub")
				return
			}
			switch generic.T {
			case "pong":
				// Pong response, do nothing
			case "config":
				var cfgMsg proto.HubConfig
				if err := json.Unmarshal(data, &cfgMsg); err == nil {
					if cfgMsg.Interval != nil && *cfgMsg.Interval > 0 {
						interval = *cfgMsg.Interval
						log.Printf("[agent] interval updated by hub to %ds", interval)
					}
					if cfgMsg.BucketMinutes != nil && *cfgMsg.BucketMinutes > 0 {
						c.aggregator.SetBucketMinutes(*cfgMsg.BucketMinutes)
						log.Printf("[agent] bucket_minutes updated by hub to %d", *cfgMsg.BucketMinutes)
					}
				}
			case "bye":
				var byeMsg proto.HubBye
				_ = json.Unmarshal(data, &byeMsg)
				log.Printf("[agent] received bye from hub: %s", byeMsg.Reason)
				conn.Close(websocket.StatusNormalClosure, "hub requested bye")
				readErrCh <- errors.New("bye received")
				return
			default:
				// Unknown message per API §2 -> close 4000
				log.Printf("[agent] unknown message type '%s' from hub", generic.T)
				conn.Close(4000, "unknown message type")
				readErrCh <- fmt.Errorf("unknown message: %s", generic.T)
				return
			}
		}
	}()

	// Periodic sample loop
	for {
		// Calculate next boundary aligned with interval
		currentAlignedNow := time.Now().UnixMilli() + clockOffsetMs
		intervalMs := int64(interval * 1000)
		nextBoundaryMs := ((currentAlignedNow / intervalMs) + 1) * intervalMs
		targetLocalMs := nextBoundaryMs - clockOffsetMs + jitterMs
		waitDuration := time.Duration(targetLocalMs-time.Now().UnixMilli()) * time.Millisecond
		if waitDuration <= 0 {
			waitDuration = time.Duration(interval) * time.Second
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-readErrCh:
			return err
		case <-time.After(waitDuration):
		}

		// Collect sample
		sampleCtx, sampleCancel := context.WithTimeout(ctx, 3*time.Second)
		sample, err := c.collector.CollectSample(sampleCtx)
		sampleCancel()
		if err != nil {
			log.Printf("[agent] error collecting sample: %v", err)
			continue
		}

		// Feed aggregator
		completedBucket := c.aggregator.Ingest(sample)
		if completedBucket != nil {
			sample.B = completedBucket
		}

		sampleBytes, err := json.Marshal(sample)
		if err != nil {
			log.Printf("[agent] error marshaling sample: %v", err)
			continue
		}

		writeCtx, writeCancel := context.WithTimeout(ctx, 5*time.Second)
		err = conn.Write(writeCtx, websocket.MessageText, sampleBytes)
		writeCancel()
		if err != nil {
			return fmt.Errorf("failed to write sample: %w", err)
		}
	}
}
