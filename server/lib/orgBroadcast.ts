import type { Response } from "express";

const clients = new Map<number, Set<Response>>();

export function registerClient(orgId: number, res: Response): void {
  if (!clients.has(orgId)) clients.set(orgId, new Set());
  clients.get(orgId)!.add(res);
}

export function unregisterClient(orgId: number, res: Response): void {
  const org = clients.get(orgId);
  if (org) {
    org.delete(res);
    if (org.size === 0) clients.delete(orgId);
  }
}

export function broadcastToOrg(orgId: number, event: string, data: unknown): void {
  const org = clients.get(orgId);
  if (!org || org.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of org) {
    try {
      res.write(payload);
    } catch {
      org.delete(res);
    }
  }
}
