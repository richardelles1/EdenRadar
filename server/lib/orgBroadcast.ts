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

const userClients = new Map<string, Set<Response>>();

export function registerUserClient(userId: string, res: Response): void {
  if (!userClients.has(userId)) userClients.set(userId, new Set());
  userClients.get(userId)!.add(res);
}

export function unregisterUserClient(userId: string, res: Response): void {
  const set = userClients.get(userId);
  if (set) {
    set.delete(res);
    if (set.size === 0) userClients.delete(userId);
  }
}

export function broadcastToUsers(userIds: Iterable<string>, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const seen = new Set<string>();
  for (const userId of userIds) {
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const set = userClients.get(userId);
    if (!set || set.size === 0) continue;
    for (const res of set) {
      try {
        res.write(payload);
      } catch {
        set.delete(res);
      }
    }
  }
}
