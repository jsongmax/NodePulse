package collect

import (
	"math"
	"sync"

	"nodepulse/agent/internal/proto"
)

// Aggregator collects 2s samples and generates 1m/2m buckets
type Aggregator struct {
	mu            sync.Mutex
	bucketMinutes int

	// Current bucket state
	currentBoundaryTS int64
	sampleCount       int

	// Running sums & maxes
	cpuSum, cpuMax   float64
	memSum, memMax   float64
	swpSum, swpMax   float64
	dskSum, dskMax   float64
	ld1Sum, ld1Max   float64
	ninSum, ninMax   float64
	noutSum, noutMax float64
	tcpSum, tcpMax   float64
	udpSum, udpMax   float64
	prSum, prMax     float64

	// RX/TX at the start of current bucket
	startRX, startTX int64
	lastRX, lastTX   int64
	hasStartNet      bool
}

func NewAggregator(bucketMinutes int) *Aggregator {
	if bucketMinutes <= 0 {
		bucketMinutes = 1
	}
	return &Aggregator{
		bucketMinutes: bucketMinutes,
	}
}

func (a *Aggregator) SetBucketMinutes(m int) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if m > 0 {
		a.bucketMinutes = m
	}
}

func (a *Aggregator) GetBucketBoundary(ts int64) int64 {
	bucketSec := int64(a.bucketMinutes * 60)
	return (ts / bucketSec) * bucketSec
}

func round1(val float64) float64 {
	return math.Round(val*10) / 10
}

func round2(val float64) float64 {
	return math.Round(val*100) / 100
}

// Ingest receives a new AgentSample. If a boundary crossing occurred, it returns a completed Bucket.
func (a *Aggregator) Ingest(sample proto.AgentSample) *proto.Bucket {
	a.mu.Lock()
	defer a.mu.Unlock()

	sampleBoundary := a.GetBucketBoundary(sample.TS)

	var completedBucket *proto.Bucket

	// First sample ever
	if a.currentBoundaryTS == 0 {
		a.currentBoundaryTS = sampleBoundary
	} else if sampleBoundary > a.currentBoundaryTS {
		// We crossed a bucket boundary! Compute bucket for previous period
		if a.sampleCount > 0 {
			n := a.sampleCount
			nFloat := float64(n)

			rxb := a.lastRX - a.startRX
			if rxb < 0 {
				rxb = 0
			}
			txb := a.lastTX - a.startTX
			if txb < 0 {
				txb = 0
			}

			completedBucket = &proto.Bucket{
				TS:   a.currentBoundaryTS,
				CPU:  []float64{round1(a.cpuSum / nFloat), round1(a.cpuMax)},
				Mem:  []float64{round1(a.memSum / nFloat), round1(a.memMax)},
				Swp:  []float64{round1(a.swpSum / nFloat)},
				Dsk:  []float64{round1(a.dskSum / nFloat)},
				LD1:  []float64{round2(a.ld1Sum / nFloat), round2(a.ld1Max)},
				Nin:  []float64{round1(a.ninSum / nFloat), round1(a.ninMax)},
				Nout: []float64{round1(a.noutSum / nFloat), round1(a.noutMax)},
				RXb:  rxb,
				TXb:  txb,
				TCP:  []float64{round1(a.tcpSum / nFloat)},
				UDP:  []float64{round1(a.udpSum / nFloat)},
				Pr:   []float64{round1(a.prSum / nFloat)},
				N:    n,
			}
		}

		// Reset state for new bucket
		a.currentBoundaryTS = sampleBoundary
		a.sampleCount = 0
		a.cpuSum, a.cpuMax = 0, 0
		a.memSum, a.memMax = 0, 0
		a.swpSum, a.swpMax = 0, 0
		a.dskSum, a.dskMax = 0, 0
		a.ld1Sum, a.ld1Max = 0, 0
		a.ninSum, a.ninMax = 0, 0
		a.noutSum, a.noutMax = 0, 0
		a.tcpSum, a.tcpMax = 0, 0
		a.udpSum, a.udpMax = 0, 0
		a.prSum, a.prMax = 0, 0
		a.startRX = sample.Net.RX
		a.startTX = sample.Net.TX
	}

	// Record start net counters if not set
	if !a.hasStartNet || a.sampleCount == 0 {
		a.startRX = sample.Net.RX
		a.startTX = sample.Net.TX
		a.hasStartNet = true
	}
	a.lastRX = sample.Net.RX
	a.lastTX = sample.Net.TX

	// Accumulate sample
	a.sampleCount++
	a.cpuSum += sample.CPU
	if sample.CPU > a.cpuMax {
		a.cpuMax = sample.CPU
	}

	// Mem %
	memPct := 0.0
	if sample.Mem.T > 0 {
		memPct = (float64(sample.Mem.U) / float64(sample.Mem.T)) * 100
	}
	a.memSum += memPct
	if memPct > a.memMax {
		a.memMax = memPct
	}

	// Swap %
	swpPct := 0.0
	if sample.Swp.T > 0 {
		swpPct = (float64(sample.Swp.U) / float64(sample.Swp.T)) * 100
	}
	a.swpSum += swpPct
	if swpPct > a.swpMax {
		a.swpMax = swpPct
	}

	// Primary disk %
	dskPct := 0.0
	if len(sample.Dsk) > 0 && sample.Dsk[0].T > 0 {
		dskPct = (float64(sample.Dsk[0].U) / float64(sample.Dsk[0].T)) * 100
	}
	a.dskSum += dskPct
	if dskPct > a.dskMax {
		a.dskMax = dskPct
	}

	// Load1
	ld1 := sample.LD[0]
	a.ld1Sum += ld1
	if ld1 > a.ld1Max {
		a.ld1Max = ld1
	}

	// Net rates
	a.ninSum += sample.Net.RXs
	if sample.Net.RXs > a.ninMax {
		a.ninMax = sample.Net.RXs
	}
	a.noutSum += sample.Net.TXs
	if sample.Net.TXs > a.noutMax {
		a.noutMax = sample.Net.TXs
	}

	// Connections & Process
	tcpVal := float64(sample.Cn.TCP)
	a.tcpSum += tcpVal
	if tcpVal > a.tcpMax {
		a.tcpMax = tcpVal
	}
	udpVal := float64(sample.Cn.UDP)
	a.udpSum += udpVal
	if udpVal > a.udpMax {
		a.udpMax = udpVal
	}
	prVal := float64(sample.Pr)
	a.prSum += prVal
	if prVal > a.prMax {
		a.prMax = prVal
	}

	return completedBucket
}
