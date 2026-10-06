import { Session, type SessionContext } from './session.svelte';
import type { ConnectionNode } from './tree';

/** The open tabs and which one is in front. */
export class SessionManager {
  sessions = $state<Session[]>([]);
  activeId = $state<string | null>(null);

  constructor(private readonly context: SessionContext) {}

  get active(): Session | null {
    return this.sessions.find((session) => session.id === this.activeId) ?? null;
  }

  /** Like RDM: opening a connection that already has a tab brings that tab to
   *  the front; forceNew opens a second session to the same target. */
  open(node: ConnectionNode, forceNew = false): Session {
    const existing = forceNew ? undefined : this.sessions.find((session) => session.node.key === node.key);
    if (existing) {
      this.activeId = existing.id;
      return existing;
    }
    const session = new Session(node, this.context);
    this.sessions.push(session);
    this.activeId = session.id;
    return session;
  }

  activate(id: string): void {
    if (this.sessions.some((session) => session.id === id)) this.activeId = id;
  }

  close(id: string): void {
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index < 0) return;
    const [session] = this.sessions.splice(index, 1);
    session.dispose();
    if (this.activeId === id) {
      const next = this.sessions[Math.min(index, this.sessions.length - 1)];
      this.activeId = next?.id ?? null;
    }
  }

  closeOthers(id: string): void {
    for (const session of [...this.sessions]) if (session.id !== id) this.close(session.id);
  }

  closeAll(): void {
    for (const session of [...this.sessions]) this.close(session.id);
  }

  /** Tab order changed by drag and drop. */
  move(id: string, toIndex: number): void {
    const from = this.sessions.findIndex((session) => session.id === id);
    if (from < 0 || from === toIndex) return;
    const [session] = this.sessions.splice(from, 1);
    this.sessions.splice(Math.max(0, Math.min(toIndex, this.sessions.length)), 0, session);
  }

  openCount(key: string): number {
    return this.sessions.filter((session) => session.node.key === key).length;
  }
}
