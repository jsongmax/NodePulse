//go:build linux

package collect

import (
	"context"
	"math"

	"github.com/shirou/gopsutil/v4/sensors"
)

func getTemperature() *float64 {
	temps, err := sensors.TemperaturesWithContext(context.Background())
	if err != nil || len(temps) == 0 {
		return nil
	}
	for _, sensor := range temps {
		if sensor.Temperature > 0 && sensor.Temperature < 150 {
			val := math.Round(sensor.Temperature*10) / 10
			return &val
		}
	}
	return nil
}
