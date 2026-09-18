export interface ServerRecord {
  id: string;
  name: string;
  group_id: string | null;
  token_hash: ArrayBuffer | Uint8Array;
  token_prefix: string;
  note: string | null;
  sort_order: number;
  public: number; // 0 or 1
  geo_lat: number | null;
  geo_lng: number | null;
  geo_label: string | null;
  country: string | null;
  traffic_quota_bytes: number | null;
  traffic_reset_day: number | null;
  traffic_direction: string | null;
  interval_s: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface GroupRecord {
  id: string;
  name: string;
  sort_order: number;
}

export interface UserRecord {
  id: string;
  username: string;
  display_name: string | null;
  role: 'admin';
  created_at: number;
}

export interface PasskeyRecord {
  id: string;
  user_id: string;
  credential_id: ArrayBuffer | Uint8Array;
  public_key: ArrayBuffer | Uint8Array;
  counter: number;
  transports: string | null;
  aaguid: string | null;
  backed_up: number; // 0 or 1
  name: string | null;
  created_at: number;
  last_used_at: number | null;
}

export interface SessionRecord {
  id_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  ip_hash: string | null;
  ua: string | null;
}

export interface ViewTokenRecord {
  id: string;
  token_hash: string;
  name: string;
  scope: string; // JSON: { groups: [], servers: [], fields: 'public' | 'full' }
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
}

export interface AuditRecord {
  ts: number;
  user_id: string | null;
  action: string;
  target: string | null;
  details: string | null;
  ip_hash: string | null;
}
