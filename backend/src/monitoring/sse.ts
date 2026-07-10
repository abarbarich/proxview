import type { ServerResponse } from 'node:http';

const clients = new Set<ServerResponse>();
let heartbeat: NodeJS.Timeout | undefined;

export function addClient(res: ServerResponse): void {
  clients.add(res);
  res.on('close', () => clients.delete(res));
  if (!heartbeat) {
    heartbeat = setInterval(() => {
      for (const c of clients) {
        try {
          c.write(': ping\n\n');
        } catch {
          clients.delete(c);
        }
      }
    }, 25_000);
    heartbeat.unref?.();
  }
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    try {
      c.write(payload);
    } catch {
      clients.delete(c);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
