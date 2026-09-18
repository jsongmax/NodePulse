package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// AllowInsecureWS is set only under dev builds (via -tags dev)
var AllowInsecureWS = false

type Config struct {
	Hub             string   `yaml:"hub"`
	Token           string   `yaml:"token"`
	Interval        int      `yaml:"interval"`
	Disks           []string `yaml:"disks"`
	NicsExclude     []string `yaml:"nics_exclude"`
	ReportPublicIP  bool     `yaml:"report_public_ip"`
}

func DefaultConfig() Config {
	return Config{
		Interval:       10,
		Disks:          []string{"/"},
		NicsExclude:    []string{"lo", "docker", "veth"},
		ReportPublicIP: false,
	}
}

// LoadConfig reads YAML from path if exists, and merges environment variables.
func LoadConfig(path string) (*Config, error) {
	cfg := DefaultConfig()

	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil && !os.IsNotExist(err) {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
		if err == nil {
			if err := yaml.Unmarshal(data, &cfg); err != nil {
				return nil, fmt.Errorf("failed to parse yaml config: %w", err)
			}
		}
	}

	// Environment overrides
	if envHub := os.Getenv("NP_HUB"); envHub != "" {
		cfg.Hub = envHub
	}
	if envToken := os.Getenv("NP_TOKEN"); envToken != "" {
		cfg.Token = envToken
	}
	if envInterval := os.Getenv("NP_INTERVAL"); envInterval != "" {
		if val, err := strconv.Atoi(envInterval); err == nil && val > 0 {
			cfg.Interval = val
		}
	}
	if envDisks := os.Getenv("NP_DISKS"); envDisks != "" {
		parts := strings.Split(envDisks, ",")
		var cleaned []string
		for _, p := range parts {
			t := strings.TrimSpace(p)
			if t != "" {
				cleaned = append(cleaned, t)
			}
		}
		if len(cleaned) > 0 {
			cfg.Disks = cleaned
		}
	}
	if envExclude := os.Getenv("NP_NICS_EXCLUDE"); envExclude != "" {
		parts := strings.Split(envExclude, ",")
		var cleaned []string
		for _, p := range parts {
			t := strings.TrimSpace(p)
			if t != "" {
				cleaned = append(cleaned, t)
			}
		}
		if len(cleaned) > 0 {
			cfg.NicsExclude = cleaned
		}
	}
	if envPublicIP := os.Getenv("NP_REPORT_PUBLIC_IP"); envPublicIP != "" {
		cfg.ReportPublicIP = envPublicIP == "1" || strings.ToLower(envPublicIP) == "true"
	}

	if err := ValidateConfig(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// ValidateConfig validates hub URL, token format, interval, etc.
func ValidateConfig(cfg *Config) error {
	if cfg.Hub == "" {
		return errors.New("hub url is required (config 'hub' or env 'NP_HUB')")
	}

	u, err := url.Parse(cfg.Hub)
	if err != nil {
		return fmt.Errorf("invalid hub url: %w", err)
	}

	if AllowInsecureWS {
		if u.Scheme != "wss" && u.Scheme != "ws" {
			return fmt.Errorf("hub url scheme must be wss:// or ws:// (got %s)", u.Scheme)
		}
	} else {
		if u.Scheme != "wss" {
			return fmt.Errorf("hub url scheme must be wss:// (got %s)", u.Scheme)
		}
	}

	if u.Host == "" {
		return errors.New("hub url missing host")
	}

	if cfg.Token == "" {
		return errors.New("token is required (config 'token' or env 'NP_TOKEN')")
	}

	// Validate token format: np1.<serverId>.<secret>
	parts := strings.Split(cfg.Token, ".")
	if len(parts) != 3 || parts[0] != "np1" {
		return errors.New("invalid token format: must be np1.<serverId>.<secret>")
	}
	if len(parts[1]) < 6 || len(parts[2]) < 16 {
		return errors.New("token components too short")
	}

	if cfg.Interval < 1 || cfg.Interval > 300 {
		return fmt.Errorf("interval must be between 1 and 300 seconds (got %d)", cfg.Interval)
	}

	return nil
}
