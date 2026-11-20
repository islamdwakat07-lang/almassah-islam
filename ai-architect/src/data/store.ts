/**
 * التخزين: واجهة واحدة فوق مخازن قابلة للاستبدال.
 *  LocalRepo: ذاكرة الجهاز (داخل تطبيق المهندس إسلام وأي متصفح) · MemoryRepo: احتياطي
 *  CloudRepo: قاعدة بيانات خاصة بالمستخدم عند النشر على claude.ai (data/users/<id>/<مشروع>)
 * الحفظ التلقائي بعد 400 ملّي ثانية من آخر تعديل، وعند إغلاق الصفحة.
 */
import { Project, migrate } from "./model";

export interface Repo { kind: "local" | "memory" | "cloud"; list(): Promise<any[]>; get(id: string): Promise<any>; put(p: Project): Promise<void>; remove(id: string): Promise<void> }
const PREFIX = "aiarch:project:";

export class MemoryRepo implements Repo {
  kind = "memory" as const; private m = new Map<string, string>();
  async list() { return [...this.m.values()].map(s => JSON.parse(s)); }
  async get(id: string) { const s = this.m.get(id); return s ? JSON.parse(s) : null; }
  async put(p: Project) { this.m.set(p.id, JSON.stringify(p)); }
  async remove(id: string) { this.m.delete(id); }
}
export class LocalRepo implements Repo {
  kind = "local" as const;
  constructor() { localStorage.setItem("aiarch:probe", "1"); localStorage.removeItem("aiarch:probe"); }
  async list() { const out: any[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) { try { out.push(JSON.parse(localStorage.getItem(k) as string)); } catch (e) { /* تجاهل */ } } } return out; }
  async get(id: string) { try { return JSON.parse(localStorage.getItem(PREFIX + id) || "null"); } catch (e) { return null; } }
  async put(p: Project) { localStorage.setItem(PREFIX + p.id, JSON.stringify(p)); }
  async remove(id: string) { localStorage.removeItem(PREFIX + id); }
}
export class CloudRepo implements Repo {
  kind = "cloud" as const; private base: string;
  constructor(private db: any, uid: string) { this.base = "data/users/" + uid; }
  async list() { const s = await this.db.collection(this.base).get(); return s.docs.map((d: any) => d.data()).filter((d: any) => d && d.parcel && d.id); }
  async get(id: string) { const s = await this.db.doc(this.base + "/" + id).get(); return s.exists ? s.data() : null; }
  async put(p: Project) { await this.db.doc(this.base + "/" + p.id).set(JSON.parse(JSON.stringify(p))); }
  async remove(id: string) { await this.db.doc(this.base + "/" + id).delete(); }
}
export function makeLocalRepo(): Repo { try { return new LocalRepo(); } catch (e) { return new MemoryRepo(); } }

export type StoreEvent = { type: "status"; status: "saving" | "saved" | "error"; detail?: string } | { type: "changed" } | { type: "repo"; kind: string };
export class Store {
  private listeners = new Set<(e: StoreEvent) => void>(); private timers = new Map<string, any>(); private pending = new Map<string, Project>();
  constructor(public repo: Repo) {}
  on(fn: (e: StoreEvent) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(e: StoreEvent) { this.listeners.forEach(f => { try { f(e); } catch (er) { console.error(er); } }); }
  async list(): Promise<Project[]> { return (await this.repo.list()).map(migrate).filter(Boolean as any as (x: Project | null) => x is Project).sort((a, b) => b.updatedAt - a.updatedAt); }
  async get(id: string) { const p = this.pending.get(id); return p || migrate(await this.repo.get(id)); }
  async create(p: Project) { await this.repo.put(p); this.emit({ type: "changed" }); return p; }
  async remove(id: string) { this.cancel(id); await this.repo.remove(id); this.emit({ type: "changed" }); }
  save(p: Project, delay = 400) { this.pending.set(p.id, p); this.emit({ type: "status", status: "saving" }); clearTimeout(this.timers.get(p.id)); this.timers.set(p.id, setTimeout(() => this.flush(p.id), delay)); }
  cancel(id: string) { clearTimeout(this.timers.get(id)); this.timers.delete(id); this.pending.delete(id); }
  async flush(id?: string) {
    for (const k of id ? [id] : [...this.pending.keys()]) {
      const p = this.pending.get(k); if (!p) continue;
      clearTimeout(this.timers.get(k)); this.timers.delete(k); this.pending.delete(k);
      try { await this.repo.put(p); this.emit({ type: "status", status: "saved" }); }
      catch (e: any) { this.pending.set(k, p); this.emit({ type: "status", status: "error", detail: e && (e.message || e.code) }); }
    }
  }
  async adopt(repo: Repo) {
    await this.flush(); const mine = await this.repo.list(), there = new Map((await repo.list()).map((p: any) => [p.id, p]));
    for (const p of mine) { const t: any = there.get(p.id); if (!t || (t.updatedAt || 0) < (p.updatedAt || 0)) await repo.put(p); }
    this.repo = repo; this.emit({ type: "changed" }); this.emit({ type: "repo", kind: repo.kind });
  }
}
