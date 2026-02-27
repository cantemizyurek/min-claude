import type { WsOutgoingMessage } from "@min-claude/shared";

/** Minimal interface for a WebSocket connection used by the hub. */
export interface WsConnection {
  send(data: string): void;
  readyState: number;
}

/** Open state constant matching the WebSocket spec. */
const WS_OPEN = 1;

/**
 * WsHub manages WebSocket client subscriptions to `prd:{prdId}` channels
 * and broadcasts messages to all subscribers of a channel.
 */
export class WsHub {
  private channels = new Map<string, Set<WsConnection>>();

  private channelKey(prdId: number): string {
    return `prd:${prdId}`;
  }

  /** Subscribe a connection to a PRD channel. */
  subscribe(ws: WsConnection, prdId: number): void {
    const key = this.channelKey(prdId);
    let subs = this.channels.get(key);
    if (!subs) {
      subs = new Set();
      this.channels.set(key, subs);
    }
    subs.add(ws);
  }

  /** Unsubscribe a connection from a PRD channel. */
  unsubscribe(ws: WsConnection, prdId: number): void {
    const key = this.channelKey(prdId);
    const subs = this.channels.get(key);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.channels.delete(key);
      }
    }
  }

  /** Remove a connection from all channels (used on disconnect). */
  removeFromAll(ws: WsConnection): void {
    for (const [key, subs] of this.channels) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.channels.delete(key);
      }
    }
  }

  /** Broadcast a message to all connections subscribed to the given PRD channel. */
  broadcast(prdId: number, message: WsOutgoingMessage): void {
    const key = this.channelKey(prdId);
    const subs = this.channels.get(key);
    if (!subs) return;

    const payload = JSON.stringify(message);
    for (const ws of subs) {
      if (ws.readyState === WS_OPEN) {
        ws.send(payload);
      }
    }
  }

  /** Get the number of subscribers for a given PRD channel. */
  getSubscriberCount(prdId: number): number {
    const key = this.channelKey(prdId);
    return this.channels.get(key)?.size ?? 0;
  }

  /** Get total number of active channels. */
  getChannelCount(): number {
    return this.channels.size;
  }
}
