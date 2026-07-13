# Proxmox API coverage & metric roadmap

What ProxView pulls from Proxmox today, what's worth adding, and — the master filter —
**what a read-only `PVEAuditor` / PBS `Audit` token can actually read.** ProxView never uses
elevated credentials, so any metric that needs `Sys.Modify`, `VM.Monitor`, `Remote.Audit`,
etc. is out of scope unless the token's role is deliberately widened.

## The permission model (the filter for everything below)

- **PVEAuditor** = the union of every privilege group's *audit* bucket: `Sys.Audit`,
  `Datastore.Audit`, `VM.Audit`, `VM.GuestAgent.Audit`, `Pool.Audit`, `SDN.Audit`,
  `Mapping.Audit`. It has **no** `Sys.Modify`, `VM.Monitor`, `VM.Console`, or
  `VM.GuestAgent.{FileRead,Unrestricted}`.
- **PBS `Audit`** = `Sys.Audit` + `Datastore.Audit` only — **no** `Remote.Audit` or
  `Tape.Audit`.
- ProxView grants the token at `/` with propagate, so `Sys.Audit`-on-`/` endpoints
  (SMART / ZFS / LVM) work.

## What we ingest today

| Source | Endpoint | Used for |
|--------|----------|----------|
| PVE | `GET /cluster/resources` | nodes + guests: cpu, mem, disk, uptime, status |
| PVE | `GET /cluster/status` | quorum, node online/offline, **node IPs** (new) |
| PVE | `GET /nodes/{node}/status` | **loadavg** (new) |
| PBS | `GET /status/datastore-usage` (+ fallbacks) | datastore fill, estimated-full |
| PBS | `GET /admin/datastore/{s}/{namespace,groups}` | backup groups per namespace |
| PBS | `GET /nodes/{node}/status`, `.../tasks` | PBS host stats, GC + verify status |
| SSH | `sensors -j`, RAPL, `ipmitool` | CPU/NVMe/drive temps, CPU + system watts |

## ✅ Shipped

- **Per-node management IP** — extracted from `/cluster/status` (was already fetched, `ip`
  field was dropped). Shown on the node card and detail page.
- **"Open in Proxmox ↗" web-UI link** — on the node detail page, links to
  `https://<node-ip>:8006`. Best-effort: assumes the browser can reach the node's mgmt IP
  (true on the same LAN/tailnet; may not resolve if ProxView reaches nodes over a tunnel the
  browser isn't on).
- **`loadavg`** — the UI already rendered it but it was only populated in demo mode; now
  filled live from `/nodes/{node}/status`.

---

## Near-term backlog (audit-safe, high value)

### 1. Per-guest network & disk I/O — LOW effort
`netin`, `netout`, `diskread`, `diskwrite` are **already in the `/cluster/resources` payload we
fetch** and currently discarded. They're cumulative byte counters, so a useful **rate** needs
a per-poll delta (same pattern as the RAPL watt calc in `sensors.ts`), or pull the rate
directly from RRD (item 2). Also free in that payload: `hastate`, `lock`, `tags`, `pool`.
- **Perm:** ✓ already have it. **Surface:** guest row / guest detail I/O sparkbars; HA-state
  chip.

### 2. RRD time-series history — MED/HIGH effort, biggest UX win
Real historical graphs straight from Proxmox instead of our own point samples.
- `GET /nodes/{node}/rrddata` → `cpu, iowait, loadavg, memused/memtotal, swapused, rootused,
  netin, netout` — ✓ `Sys.Audit`.
- `GET /nodes/{node}/{qemu,lxc}/{vmid}/rrddata` → per-guest `cpu, mem, netin/out,
  diskread/write` — ✓ `VM.Audit`.
- `GET /nodes/{node}/storage/{s}/rrddata` → `total, used` — ✓ `Datastore.Audit`.
- Params: `timeframe=hour|day|week|month|year`, `cf=AVERAGE|MAX`.
- **Decision:** whether RRD complements or replaces parts of the SQLite timeseries. `iowait`
  and per-guest disk I/O history are standouts we can't get any other way.

### 3. Failed / recent task feed — LOW/MED effort, high signal
- PVE `GET /nodes/{node}/tasks` (we already hit the PBS equivalent, only scraping GC/verify).
- Fields: `upid, type, status, starttime, endtime, user, id`; filter `errors`,
  `typefilter=vzdump`. Surfaces silent **backup / migration / replication failures**.
- **Perm:** ✓ `user:all`, all tasks visible with `Sys.Audit` on the node.
- **Surface:** a "recent failures" panel on the overview + per-node task list.

### 4. Disk / SMART / ZFS health — MED effort, "disk is dying" detection
- `GET /nodes/{node}/disks/list` → `model, serial, size, health` (SMART PASSED/FAILED), `used`.
- `GET /nodes/{node}/disks/smart` → per-attribute values (reallocated/pending sectors, SSD
  wear, temp).
- `GET /nodes/{node}/disks/zfs` → per-pool `health` (DEGRADED/FAULTED), `frag`, `alloc/free`.
- **Perm:** ✓ but SMART/ZFS check **`Sys.Audit` on `/`** specifically — our token has it.
- Apply to **both PVE nodes and the PBS host** (PBS *is* the backup storage). Availability:
  SMART needs a supporting bus (NVMe/SATA yes, some USB no); ZFS only if used.

### 5. Cluster HA + quorum polish — LOW/MED effort
- `GET /cluster/ha/status/current` → per-resource `state` (error/fence/recovery), `crm_state`.
- `GET /cluster/ha/resources` → configured HA resources/groups. **Perm:** ✓ `Sys.Audit` on `/`.

### 6. Storage health & backup coverage — MED effort
- `GET /nodes/{node}/storage` → per-storage `active` flag (**enabled-but-not-mounted =
  failure**, invisible in `/cluster/resources`), `used/avail/total`, `content`.
- `GET /cluster/backup-info/not-backed-up` → **guests no backup job covers** ("what am I
  forgetting?"). **Perm:** ✓ `Datastore.Audit` / `Sys.Audit` on `/`.

### 7. PBS depth — MED effort
- `GET /admin/datastore/{s}/snapshots` → per-snapshot `backup-time, size, owner, protected,
  verification` — exact newest-snapshot age, verify state, protected flags.
- `GET /admin/datastore/{s}/gc` → GC schedule + `index-data-bytes` / `disk-bytes` →
  **deduplication factor** (how the PBS UI computes it).
- `GET /config/{prune,verify}` → prune/verify schedules & retention.
- `GET /nodes/{node}/disks/*` (PBS) → PBS host disk/SMART/ZFS (see item 4).
- **Perm:** ✓ `Datastore.Audit` / `Sys.Audit`.

---

## IP & web-UI link — deeper phases (beyond the shipped node link)

- **PBS web-UI link** — small follow-up: expose the configured PBS `baseUrl` (already
  `https://host:8007`) on `PbsSnapshot` and add the same "Open in Proxmox Backup ↗" link on
  the PBS detail page.
- **Cluster/site-level link** — link the site header to a node's `:8006` (any online node).
- **Per-guest IP addresses:**
  - **LXC:** `GET /nodes/{node}/lxc/{vmid}/interfaces` → IPs from inside the container, **no
    agent required**. ✓ `VM.Audit`. Cleanest win.
  - **QEMU:** `GET /nodes/{node}/qemu/{vmid}/agent/network-get-interfaces` → VM IPs. **Caveat:**
    audit-readable only on **PVE 9.0+** (`VM.GuestAgent.Audit`); on PVE ≤8.x the same data is
    gated on `VM.Monitor`, which an auditor **lacks**. Requires the guest agent installed +
    running (returns HTTP 500 otherwise — gate on the `agent` flag from `status/current`).
    Same endpoint family gives `get-fsinfo` (real in-guest filesystem fill) and `get-osinfo`.
- **VM/CT deep-links** — Proxmox supports `…/#v1:0:=qemu%2F<vmid>:…` fragment deep-links, but
  they're brittle across versions; linking to the node's datacenter UI is the robust default.

---

## ⚠️ Permission traps (verified — don't build UI expecting these)

1. **PVE `GET /nodes/{node}/apt/update` (pending updates) needs `Sys.Modify`** — NOT
   auditor-readable. Use `GET /nodes/{node}/apt/versions` instead (installed versions +
   running-vs-installed kernel → "reboot needed"). Quirk: on **PBS**, `apt/update` *is*
   auditor-readable.
2. **PBS `certificates/info` needs `Sys.Modify`** — PBS cert expiry is NOT auditor-readable
   (on PVE the same endpoint is `user:all` → ✓, so PVE cert-expiry monitoring is free).
3. **PBS sync/remote jobs need `Remote.Audit`** — invisible to the `Audit` role (silently
   empty). Tape needs `Tape.Audit` — also out.
4. **SMART / ZFS / LVM check `Sys.Audit` on `/`** (not `/nodes/{node}`) — a token scoped only
   to `/nodes` 403s. ProxView grants at `/`, so we're fine.

## Conditional / lower priority

- **PSI pressure-stall** (`pressurecpu/io/memory` from `.../status/current`) — early contention
  warning. ✓ `VM.Audit` / node status.
- **ZFS replication** (`/nodes/{node}/replication`) — stuck/failing repl before DR data goes
  stale. ✓ `VM.Audit`. Only if replication is configured.
- **Ceph** (`/cluster/ceph/status`, `/nodes/{node}/ceph/*`) — ✓ `Sys.Audit`/`Datastore.Audit`.
  Only if Ceph is deployed (many homelabs aren't). `ceph/log` needs `Sys.Syslog` → ✗.
- **Node services** (`/nodes/{node}/services`) — detect a dead `pvestatd`/`corosync`/`chrony`.
  ✓ `Sys.Audit`.
- **Subscription / cert expiry (PVE)** — ✓ `user:all`.

## Suggested sequencing

1. Guest I/O counters + HA-state chip (item 1) — cheap, already in payload.
2. Failed-task feed (item 3) — highest reliability signal per line of code.
3. Disk/SMART/ZFS health, PVE + PBS (items 4, 7) — hardware failure detection.
4. RRD history (item 2) — the big UX lift; decide vs. the SQLite timeseries first.
5. LXC IPs + PBS/site web-UI links; then QEMU guest-agent data (mind the PVE-version gate).
6. Storage `active` + backup coverage (item 6); HA polish (item 5).
