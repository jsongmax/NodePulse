package collect

import (
	"testing"

	"nodepulse/agent/internal/proto"
)

func TestAggregator(t *testing.T) {
	agg := NewAggregator(1) // 1 minute bucket

	// Feed samples in minute 1758000000 (starts at 1758000000)
	baseTS := int64(1758000000)

	// Sample 1 at 1758000002
	s1 := proto.AgentSample{
		TS:  baseTS + 2,
		CPU: 10.0,
		LD:  [3]float64{0.5, 0.4, 0.3},
		Mem: proto.UsagePair{U: 400, T: 1000}, // 40%
		Swp: proto.UsagePair{U: 0, T: 100},
		Dsk: []proto.DiskSample{{M: "/", U: 300, T: 1000}}, // 30%
		Net: proto.NetSample{RX: 1000, TX: 500, RXs: 100, TXs: 50},
		Cn:  proto.ConnSample{TCP: 10, UDP: 2},
		Pr:  100,
	}
	b := agg.Ingest(s1)
	if b != nil {
		t.Fatal("expected nil bucket for first sample")
	}

	// Sample 2 at 1758000004
	s2 := proto.AgentSample{
		TS:  baseTS + 4,
		CPU: 20.0,
		LD:  [3]float64{0.7, 0.4, 0.3},
		Mem: proto.UsagePair{U: 600, T: 1000}, // 60%
		Swp: proto.UsagePair{U: 0, T: 100},
		Dsk: []proto.DiskSample{{M: "/", U: 300, T: 1000}}, // 30%
		Net: proto.NetSample{RX: 3000, TX: 1500, RXs: 200, TXs: 100},
		Cn:  proto.ConnSample{TCP: 20, UDP: 4},
		Pr:  110,
	}
	b = agg.Ingest(s2)
	if b != nil {
		t.Fatal("expected nil bucket within same minute")
	}

	// Sample 3 at next minute 1758000062 -> should trigger bucket for 1758000000
	s3 := proto.AgentSample{
		TS:  baseTS + 62,
		CPU: 15.0,
		LD:  [3]float64{0.6, 0.4, 0.3},
		Mem: proto.UsagePair{U: 500, T: 1000},
		Net: proto.NetSample{RX: 5000, TX: 2500, RXs: 150, TXs: 75},
		Cn:  proto.ConnSample{TCP: 15, UDP: 3},
		Pr:  105,
	}
	b = agg.Ingest(s3)
	if b == nil {
		t.Fatal("expected completed bucket when crossing minute boundary")
	}

	if b.TS != baseTS {
		t.Errorf("expected bucket ts %d, got %d", baseTS, b.TS)
	}
	if b.N != 2 {
		t.Errorf("expected N=2 samples in bucket, got %d", b.N)
	}
	// CPU avg = (10+20)/2 = 15.0, max = 20.0
	if b.CPU[0] != 15.0 || b.CPU[1] != 20.0 {
		t.Errorf("expected cpu [15.0, 20.0], got %v", b.CPU)
	}
	// Mem avg = (40+60)/2 = 50.0, max = 60.0
	if b.Mem[0] != 50.0 || b.Mem[1] != 60.0 {
		t.Errorf("expected mem [50.0, 60.0], got %v", b.Mem)
	}
	// Net delta: RX = 3000 - 1000 = 2000, TX = 1500 - 500 = 1000
	if b.RXb != 2000 || b.TXb != 1000 {
		t.Errorf("expected rxb=2000, txb=1000, got rxb=%d, txb=%d", b.RXb, b.TXb)
	}
}

func TestAggregator2Min(t *testing.T) {
	agg := NewAggregator(2)
	baseTS := int64(1758000000) // even minute boundary

	// Sample in min 0
	agg.Ingest(proto.AgentSample{TS: baseTS + 10, CPU: 10, Net: proto.NetSample{RX: 100, TX: 100}})
	// Sample in min 1 (still in same 2-min bucket)
	b := agg.Ingest(proto.AgentSample{TS: baseTS + 70, CPU: 20, Net: proto.NetSample{RX: 200, TX: 200}})
	if b != nil {
		t.Fatal("expected no bucket at minute 1 for 2m bucket")
	}

	// Sample in min 2 (crosses boundary)
	b = agg.Ingest(proto.AgentSample{TS: baseTS + 130, CPU: 30, Net: proto.NetSample{RX: 300, TX: 300}})
	if b == nil {
		t.Fatal("expected bucket at minute 2 for 2m bucket")
	}
	if b.N != 2 {
		t.Errorf("expected N=2, got %d", b.N)
	}
}
