# Notifications & alerts

ProxView watches every site you add and can **push you a notification** when something needs
attention — a node drops offline, a datastore fills up, a backup goes stale, a CPU runs hot.
Alerts always show up **on-screen** as a banner on the overview; on top of that you can wire
up one or more **delivery channels** (Telegram, Slack, email, browser push) so you hear about
problems even when the dashboard isn't open.

Everything here is configured **in-app** — there are no environment variables for channels or
rules. You'll find it under two Settings tabs:

- **Settings → Notifications** — the delivery channels (where alerts go)
- **Settings → Alert rules** — the rules that decide *when* an alert fires, plus delivery
  timing and poll cadence

Channel credentials (SMTP passwords, bot tokens, webhook URLs) are stored **AES-256-GCM
encrypted at rest** in the SQLite DB, the same protection your site credentials get.

---

## How an alert becomes a notification

1. On every poll, ProxView evaluates your live snapshots against the **alert rules**.
2. A condition must hold for **`confirmPolls` consecutive polls** (default **2**) before it
   fires — this rides out a single blip so you don't get paged for a one-off hiccup.
3. When it fires, the alert is dispatched to **every enabled channel** whose minimum severity
   allows it (see [per-channel severity](#per-channel-severity)).
4. While the condition stays active, ProxView can **re-notify** every `reminderMinutes`
   (default **0 = off**) with a `Reminder:` prefix.
5. When the condition clears, ProxView sends a `Resolved:` note (info level) — toggle with
   **Notify on resolve** (default **on**).

The on-screen banner and the delivered notifications come from the **same** evaluated alert
set, so what you see in the UI is exactly what gets sent.

---

## Delivery channels

Add channels under **Settings → Notifications**. Each one has an enable toggle, a **Send
test** button, and a per-channel severity selector. Add as many as you like — e.g. a
critical-only Telegram channel plus an all-alerts email.

### Telegram

| Field | Notes |
|-------|-------|
| Bot token | From [@BotFather](https://t.me/BotFather) — looks like `123456:ABC-DEF...` |
| Chat ID | Your user ID, or a group/channel ID (e.g. `-1001234567890`) |

Messages arrive severity-prefixed (🔴 critical / 🟡 warning / ✅ resolved).

> **Getting a chat ID:** message your bot once, then open
> `https://api.telegram.org/bot<token>/getUpdates` and read `chat.id`. For a group, add the
> bot to the group first.

### Slack

| Field | Notes |
|-------|-------|
| Incoming webhook URL | `https://hooks.slack.com/services/...` — create one in *Slack → Apps → Incoming Webhooks* |

Posts to the channel the webhook is bound to, severity-prefixed.

### Email (SMTP)

| Field | Notes |
|-------|-------|
| SMTP host / Port | e.g. `smtp.gmail.com` / `587` |
| Use TLS/SSL | Tick for implicit TLS (port **465**); leave off for STARTTLS (port 587) |
| Username / Password | SMTP auth — optional for relays that don't require it |
| From / To | Sender and recipient addresses |

Subject lines are `[ProxView] <alert title>`. (Gmail and similar need an **app password**,
not your account password.)

### Browser push

Web (VAPID) push straight to your browser — works even with the tab closed.

- Click **Enable on this device**, then allow notifications when the browser asks.
- **Repeat on every device** you want alerts on — each browser is its own subscription.
- Requires a **secure context** (HTTPS, or `http://localhost`). Behind the Cloudflare or
  Tailscale wizards you already have HTTPS.

Under the hood ProxView auto-generates a VAPID keypair on first run and stores each device
subscription server-side; dead subscriptions are pruned automatically when the browser
reports them gone.

### Per-channel severity

Each channel has a minimum severity, so noisy channels can stay quiet:

| Setting | Receives |
|---------|----------|
| **All alerts** | info, warnings, critical (incl. resolved notes) |
| **Warnings & critical** | warnings and critical only |
| **Critical only** | critical only |

---

## Alert rules

Under **Settings → Alert rules** you can enable/disable each rule, set its **severity**
(warning or critical), and — where it applies — its **threshold**. Defaults:

| Rule | Group | Default | Severity | Threshold |
|------|-------|---------|----------|-----------|
| Proxmox site unreachable | PVE | on | critical | — |
| Cluster lost quorum | PVE | on | warning | — |
| Node offline | PVE | on | critical | — |
| Node memory usage | PVE | on | warning | 92% |
| Node CPU usage | PVE | **off** | warning | 90% |
| Node CPU temperature | PVE | on | critical | 85 °C |
| Node power draw | PVE | **off** | warning | 250 W |
| PBS unreachable | PBS | on | critical | — |
| Datastore fullness | PBS | on | critical | 90% |
| No recent backups | PBS | on | warning | 2 days |
| Garbage collection failed | PBS | on | critical | — |
| Verification failed | PBS | on | critical | — |

> **Node CPU** and **Node power draw** ship **disabled** by default — CPU spikes and power
> swings are normal under load, so enable them only if you have a steady baseline worth
> watching.

## Delivery timing & poll cadence

Also on the Alert rules tab:

| Setting | Default | Range | What it does |
|---------|---------|-------|--------------|
| Confirm before alert | 2 polls | 1–10 | Consecutive polls a condition must hold before firing |
| Reminder | off | 0–1440 min | Re-notify cadence while an alert stays active (0 = off) |
| Notify on resolve | on | — | Send a note when a condition clears |
| Metrics poll interval | 10 s | 5–600 s | PVE/PBS API poll cadence |
| Temperature poll interval | 45 s | 15–600 s | SSH `sensors` poll cadence |

The two poll intervals are seeded from the legacy `POLL_INTERVAL_MS` / `TEMP_INTERVAL_MS`
env vars for backwards compatibility, but once you save them here the **in-app value wins** —
edit them under Alert rules rather than in `.env`.

---

## Troubleshooting

- **No notifications at all?** Add at least one channel and hit **Send test** — the test goes
  through the real sender, so a failure message tells you exactly what's wrong.
- **Test works but real alerts never arrive?** Check the channel's severity selector isn't set
  higher than the alerts you expect, and that the relevant rule is enabled.
- **Browser push silent?** You must be on HTTPS or `localhost`, and you have to re-enable on
  each device/browser. Revoking the site's notification permission drops the subscription.
- **Too chatty?** Raise a channel to *Critical only*, bump **Confirm before alert**, or keep
  **Reminder** at 0.
