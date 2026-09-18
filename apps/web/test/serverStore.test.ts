import { describe, expect, it, beforeEach } from 'vitest';
import { useServerStore } from '../src/store/serverStore.js';
import type { SampleWithoutBucket, RingPoint } from '@nodepulse/protocol';

describe('useServerStore & Staleness Detection (M3-T2)', () => {
  beforeEach(() => {
    useServerStore.setState({
      servers: {},
      connectionStatus: 'connecting',
      groups: [],
      alerts: [],
    });
  });

  it('handles_snapshot_delta_and_bucket_updates', () => {
    const store = useServerStore.getState();

    // 1. Initial snapshot
    store.handleSnapshot([
      {
        id: 'srv_test1',
        online: true,
        last: null,
        last_ts: 1000,
      },
    ]);

    let state = useServerStore.getState();
    expect(state.servers['srv_test1']).toBeDefined();
    expect(state.servers['srv_test1']?.online).toBe(true);
    expect(state.servers['srv_test1']?.lastTs).toBe(1000);

    // 2. Delta update
    const sample: SampleWithoutBucket = {
      t: 's',
      ts: 1010,
      cpu: 45.2,
      ld: [0.5, 0.4, 0.3],
      mem: { u: 1000, t: 2000 },
      swp: { u: 0, t: 0 },
      dsk: [{ m: '/', u: 100, t: 500 }],
      net: { rx: 100, tx: 50, rxs: 10, txs: 5 },
      cn: { tcp: 12, udp: 2 },
      pr: 40,
      up: 5000,
    };

    store.handleDelta('srv_test1', 1010, sample);
    state = useServerStore.getState();
    expect(state.servers['srv_test1']?.last?.cpu).toBe(45.2);
    expect(state.servers['srv_test1']?.lastTs).toBe(1010);
    expect(state.servers['srv_test1']?.stale).toBe(false);

    // 3. Bucket append
    const point: RingPoint = [
      1010, 45.2, 50.0, 50.0, 50.0, 0, 20.0, 0.5, 0.5, 10, 10, 5, 5, 100, 50,
      12, 2, 40,
    ];
    store.handleBucket('srv_test1', point);
    state = useServerStore.getState();
    expect(state.servers['srv_test1']?.series.length).toBe(1);
    expect(state.servers['srv_test1']?.series[0]).toEqual(point);
  });

  it('detects_stale_data_when_last_report_exceeds_3x_interval', () => {
    const store = useServerStore.getState();

    // Server with interval_s = 10, lastTs = 1000
    store.handleSnapshot([
      {
        id: 'srv_stale_check',
        online: true,
        last: null,
        last_ts: 1000,
      },
    ]);

    // Check staleness at 1025 (25s elapsed, <= 30s threshold)
    store.checkStaleness(1025);
    let server = useServerStore.getState().servers['srv_stale_check']!;
    expect(server.stale).toBe(false);

    // Check staleness at 1035 (35s elapsed, > 30s threshold -> stale!)
    store.checkStaleness(1035);
    server = useServerStore.getState().servers['srv_stale_check']!;
    expect(server.stale).toBe(true);

    // When a fresh delta arrives, stale flag resets to false
    const freshSample: SampleWithoutBucket = {
      t: 's',
      ts: 1040,
      cpu: 12.0,
      ld: [0.1, 0.1, 0.1],
      mem: { u: 100, t: 1000 },
      swp: { u: 0, t: 0 },
      dsk: [],
      net: { rx: 0, tx: 0, rxs: 0, txs: 0 },
      cn: { tcp: 1, udp: 0 },
      pr: 10,
      up: 1000,
    };
    store.handleDelta('srv_stale_check', 1040, freshSample);
    server = useServerStore.getState().servers['srv_stale_check']!;
    expect(server.stale).toBe(false);
    expect(server.lastTs).toBe(1040);
  });
});
