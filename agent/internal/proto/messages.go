package proto

// HostInfo mirrors HostInfo in @nodepulse/protocol
type HostInfo struct {
	Hostname    string `json:"hostname"`
	OS          string `json:"os"`
	Platform    string `json:"platform"`
	PlatformVer string `json:"platform_ver"`
	Kernel      string `json:"kernel"`
	Arch        string `json:"arch"`
	Virt        string `json:"virt"`
	CPUModel    string `json:"cpu_model"`
	CPUCores    int    `json:"cpu_cores"`
	MemTotal    int64  `json:"mem_total"`
	SwapTotal   int64  `json:"swap_total"`
	DiskTotal   int64  `json:"disk_total"`
	BootTS      int64  `json:"boot_ts"`
}

// IPInfo mirrors IPInfo in @nodepulse/protocol
type IPInfo struct {
	V4 *string `json:"v4"`
	V6 *string `json:"v6"`
}

// AgentHello is the initial hello message from Agent to Hub
type AgentHello struct {
	T     string   `json:"t"`
	V     int      `json:"v"`
	Agent string   `json:"agent"`
	Host  HostInfo `json:"host"`
	IP    *IPInfo  `json:"ip,omitempty"`
}

// DiskSample mirrors DiskSample in @nodepulse/protocol
type DiskSample struct {
	M string `json:"m"`
	U int64  `json:"u"`
	T int64  `json:"t"`
}

// NetSample mirrors NetSample in @nodepulse/protocol
type NetSample struct {
	RX  int64   `json:"rx"`
	TX  int64   `json:"tx"`
	RXs float64 `json:"rxs"`
	TXs float64 `json:"txs"`
}

// ConnSample mirrors ConnSample in @nodepulse/protocol
type ConnSample struct {
	TCP int64 `json:"tcp"`
	UDP int64 `json:"udp"`
}

// Bucket mirrors Bucket in @nodepulse/protocol
type Bucket struct {
	TS   int64     `json:"ts"`
	CPU  []float64 `json:"cpu"`
	Mem  []float64 `json:"mem"`
	Swp  []float64 `json:"swp"`
	Dsk  []float64 `json:"dsk"`
	LD1  []float64 `json:"ld1"`
	Nin  []float64 `json:"nin"`
	Nout []float64 `json:"nout"`
	RXb  int64     `json:"rxb"`
	TXb  int64     `json:"txb"`
	TCP  []float64 `json:"tcp"`
	UDP  []float64 `json:"udp"`
	Pr   []float64 `json:"pr"`
	N    int       `json:"n"`
}

// UsagePair represents {u, t}
type UsagePair struct {
	U int64 `json:"u"`
	T int64 `json:"t"`
}

// AgentSample mirrors AgentSample in @nodepulse/protocol
type AgentSample struct {
	T   string       `json:"t"`
	TS  int64        `json:"ts"`
	CPU float64      `json:"cpu"`
	LD  [3]float64   `json:"ld"`
	Mem UsagePair    `json:"mem"`
	Swp UsagePair    `json:"swp"`
	Dsk []DiskSample `json:"dsk"`
	Net NetSample    `json:"net"`
	Cn  ConnSample   `json:"cn"`
	Pr  int64        `json:"pr"`
	Up  float64      `json:"up"`
	Tmp *float64     `json:"tmp,omitempty"`
	B   *Bucket      `json:"b,omitempty"`
}

// AgentPing is {"t": "ping"}
type AgentPing struct {
	T string `json:"t"`
}

// HubWelcome is sent from Hub to Agent
type HubWelcome struct {
	T             string `json:"t"`
	ServerID      string `json:"server_id"`
	Name          string `json:"name"`
	Interval      int    `json:"interval"`
	BucketMinutes int    `json:"bucket_minutes"`
	NowMS         int64  `json:"now_ms"`
	MaxBytes      int    `json:"max_bytes"`
}

// HubConfig is sent from Hub to update configuration
type HubConfig struct {
	T             string `json:"t"`
	Interval      *int   `json:"interval,omitempty"`
	BucketMinutes *int   `json:"bucket_minutes,omitempty"`
}

// HubBye is sent from Hub before closing
type HubBye struct {
	T      string `json:"t"`
	Reason string `json:"reason"`
}

// HubPong is sent from Hub in response to ping
type HubPong struct {
	T string `json:"t"`
}
