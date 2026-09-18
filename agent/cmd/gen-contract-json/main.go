package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"nodepulse/agent/internal/collect"
	"nodepulse/agent/internal/proto"
)

func main() {
	msgType := flag.String("type", "hello", "hello, sample, or sample_with_bucket")
	flag.Parse()

	collector := collect.NewCollector([]string{"/"}, []string{"lo", "docker", "veth"})

	switch *msgType {
	case "hello":
		hostInfo, err := collector.CollectStaticHost()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error collecting host: %v\n", err)
			os.Exit(1)
		}
		ipInfo := collect.GetPublicIP()
		hello := proto.AgentHello{
			T:     "hello",
			V:     1,
			Agent: "1.0.0",
			Host:  hostInfo,
			IP:    ipInfo,
		}
		data, _ := json.MarshalIndent(hello, "", "  ")
		fmt.Println(string(data))

	case "sample":
		sample, err := collector.CollectSample(context.Background())
		if err != nil {
			fmt.Fprintf(os.Stderr, "error collecting sample: %v\n", err)
			os.Exit(1)
		}
		data, _ := json.MarshalIndent(sample, "", "  ")
		fmt.Println(string(data))

	case "sample_with_bucket":
		sample, err := collector.CollectSample(context.Background())
		if err != nil {
			fmt.Fprintf(os.Stderr, "error collecting sample: %v\n", err)
			os.Exit(1)
		}
		agg := collect.NewAggregator(1)
		// Feed an earlier sample so this one generates a bucket
		earlier := sample
		earlier.TS -= 65
		agg.Ingest(earlier)
		b := agg.Ingest(sample)
		sample.B = b
		data, _ := json.MarshalIndent(sample, "", "  ")
		fmt.Println(string(data))

	default:
		fmt.Fprintf(os.Stderr, "unknown type: %s\n", *msgType)
		os.Exit(1)
	}
}
