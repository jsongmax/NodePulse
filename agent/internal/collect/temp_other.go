//go:build !linux

package collect

func getTemperature() *float64 {
	return nil
}
