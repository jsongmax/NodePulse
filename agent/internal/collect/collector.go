package collect

import (
	"context"
	"math"
	"net"
	"runtime"
	"strings"
	"sync"
	"time"

	"nodepulse/agent/internal/proto"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	psnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type Collector struct {
	disks       []string
	nicsExclude []string

	mu        sync.Mutex
	lastNetRX int64
	lastNetTX int64
	lastNetTS time.Time
}

func NewCollector(disks []string, nicsExclude []string) *Collector {
	if len(disks) == 0 {
		disks = []string{"/"}
	}
	if len(nicsExclude) == 0 {
		nicsExclude = []string{"lo", "docker", "veth"}
	}
	return &Collector{
		disks:       disks,
		nicsExclude: nicsExclude,
	}
}

// CollectStaticHost gathers hardware and OS details for hello
func (c *Collector) CollectStaticHost() (proto.HostInfo, error) {
	info, err := host.Info()
	if err != nil {
		return proto.HostInfo{}, err
	}

	cores, err := cpu.Counts(true)
	if err != nil || cores < 1 {
		cores = runtime.NumCPU()
	}

	cpuModel := "Unknown"
	cpuInfos, err := cpu.Info()
	if err == nil && len(cpuInfos) > 0 {
		cpuModel = cpuInfos[0].ModelName
	}

	vm, err := mem.VirtualMemory()
	memTotal := int64(0)
	if err == nil {
		memTotal = int64(vm.Total)
	}

	sm, err := mem.SwapMemory()
	swapTotal := int64(0)
	if err == nil {
		swapTotal = int64(sm.Total)
	}

	var diskTotal int64
	for _, m := range c.disks {
		usage, err := disk.Usage(m)
		if err == nil {
			diskTotal += int64(usage.Total)
		}
	}

	virt := info.VirtualizationSystem
	if virt == "" {
		virt = info.VirtualizationRole
	}
	if virt == "" {
		virt = "physical"
	}

	return proto.HostInfo{
		Hostname:    info.Hostname,
		OS:          info.OS,
		Platform:    info.Platform,
		PlatformVer: info.PlatformVersion,
		Kernel:      info.KernelVersion,
		Arch:        runtime.GOARCH,
		Virt:        virt,
		CPUModel:    cpuModel,
		CPUCores:    cores,
		MemTotal:    memTotal,
		SwapTotal:   swapTotal,
		DiskTotal:   diskTotal,
		BootTS:      int64(info.BootTime),
	}, nil
}

// CollectSample gathers dynamic metrics for a sample
func (c *Collector) CollectSample(ctx context.Context) (proto.AgentSample, error) {
	now := time.Now().Unix()

	// 1. CPU percent (2 second window per ARCHITECTURE §8)
	cpuPercents, err := cpu.PercentWithContext(ctx, 2*time.Second, false)
	cpuVal := 0.0
	if err == nil && len(cpuPercents) > 0 {
		cpuVal = math.Round(cpuPercents[0]*10) / 10
		if cpuVal < 0 {
			cpuVal = 0
		}
		if cpuVal > 100 {
			cpuVal = 100
		}
	}

	// 2. Load
	ldVal := [3]float64{0, 0, 0}
	if l, err := load.Avg(); err == nil {
		ldVal[0] = math.Round(l.Load1*100) / 100
		ldVal[1] = math.Round(l.Load5*100) / 100
		ldVal[2] = math.Round(l.Load15*100) / 100
	}

	// 3. Memory & Swap
	memPair := proto.UsagePair{}
	if vm, err := mem.VirtualMemory(); err == nil {
		memPair.U = int64(vm.Used)
		memPair.T = int64(vm.Total)
	}
	swapPair := proto.UsagePair{}
	if sm, err := mem.SwapMemory(); err == nil {
		swapPair.U = int64(sm.Used)
		swapPair.T = int64(sm.Total)
	}

	// 4. Disk mounts (up to 16)
	var diskSamples []proto.DiskSample
	for _, m := range c.disks {
		if len(diskSamples) >= 16 {
			break
		}
		u, err := disk.Usage(m)
		if err == nil {
			diskSamples = append(diskSamples, proto.DiskSample{
				M: m,
				U: int64(u.Used),
				T: int64(u.Total),
			})
		}
	}
	if len(diskSamples) == 0 {
		diskSamples = []proto.DiskSample{
			{M: "/", U: 0, T: 1},
		}
	}

	// 5. Network (cumulative + rates)
	netSample := c.collectNet()

	// 6. Connections count
	cn := proto.ConnSample{
		TCP: 0,
		UDP: 0,
	}
	if conns, err := psnet.ConnectionsWithContext(ctx, "all"); err == nil {
		for _, conn := range conns {
			if conn.Type == 1 { // syscall.SOCK_STREAM
				cn.TCP++
			} else if conn.Type == 2 { // syscall.SOCK_DGRAM
				cn.UDP++
			}
		}
	}

	// 7. Process count
	var pr int64
	if pids, err := process.Pids(); err == nil {
		pr = int64(len(pids))
	}

	// 8. Uptime
	var up float64
	if uptime, err := host.Uptime(); err == nil {
		up = float64(uptime)
	}

	// 9. Temperature (optional, supported on Linux)
	tmp := getTemperature()

	return proto.AgentSample{
		T:   "s",
		TS:  now,
		CPU: cpuVal,
		LD:  ldVal,
		Mem: memPair,
		Swp: swapPair,
		Dsk: diskSamples,
		Net: netSample,
		Cn:  cn,
		Pr:  pr,
		Up:  up,
		Tmp: tmp,
	}, nil
}

func (c *Collector) isExcludedNIC(name string) bool {
	lower := strings.ToLower(name)
	for _, ex := range c.nicsExclude {
		if strings.HasPrefix(lower, strings.ToLower(ex)) {
			return true
		}
	}
	return false
}

func (c *Collector) collectNet() proto.NetSample {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	var totalRX, totalTX int64

	ioCounters, err := psnet.IOCounters(true)
	if err == nil {
		for _, io := range ioCounters {
			if !c.isExcludedNIC(io.Name) {
				totalRX += int64(io.BytesRecv)
				totalTX += int64(io.BytesSent)
			}
		}
	}

	var rxs, txs float64
	if !c.lastNetTS.IsZero() {
		elapsed := now.Sub(c.lastNetTS).Seconds()
		if elapsed > 0 {
			if totalRX >= c.lastNetRX {
				rxs = math.Round(float64(totalRX-c.lastNetRX) / elapsed)
			}
			if totalTX >= c.lastNetTX {
				txs = math.Round(float64(totalTX-c.lastNetTX) / elapsed)
			}
		}
	}

	c.lastNetRX = totalRX
	c.lastNetTX = totalTX
	c.lastNetTS = now

	return proto.NetSample{
		RX:  totalRX,
		TX:  totalTX,
		RXs: rxs,
		TXs: txs,
	}
}

// GetPublicIP tries to detect public IP (v4, v6) without external exec
func GetPublicIP() *proto.IPInfo {
	// Query external IP via simple HTTP or DNS if needed, or inspect interfaces
	// For agent security and isolation, check non-loopback global unicast addresses
	var v4, v6 *string

	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				var ip net.IP
				switch v := addr.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}
				if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() {
					continue
				}
				ipStr := ip.String()
				if ip.To4() != nil && v4 == nil {
					v4 = &ipStr
				} else if ip.To16() != nil && v6 == nil {
					v6 = &ipStr
				}
			}
		}
	}

	if v4 == nil && v6 == nil {
		return nil
	}

	return &proto.IPInfo{
		V4: v4,
		V6: v6,
	}
}
