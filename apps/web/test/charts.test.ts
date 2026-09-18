import { describe, expect, it } from 'vitest';
import { ArcGauge } from '../src/components/charts/ArcGauge.js';

describe('Chart Components (M3-T4)', () => {
  it('renders ArcGauge with normal, warning, and critical values', () => {
    const normal = ArcGauge({ value: 50, metric: 'cpu', size: 56 });
    expect(normal).toBeDefined();

    const warning = ArcGauge({ value: 85, metric: 'cpu', size: 72 });
    expect(warning).toBeDefined();

    const critical = ArcGauge({ value: 95, metric: 'cpu', size: 120 });
    expect(critical).toBeDefined();
  });
});
