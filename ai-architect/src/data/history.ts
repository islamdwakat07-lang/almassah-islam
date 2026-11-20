/** التراجع والإعادة بلقطات كاملة للمشروع */
export class History<T> {
  private past: string[] = []; private future: string[] = [];
  constructor(private limit = 200) {}
  reset() { this.past = []; this.future = []; }
  push(state: T) { this.past.push(JSON.stringify(state)); if (this.past.length > this.limit) this.past.shift(); this.future = []; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo(current: T): T | null { const s = this.past.pop(); if (s === undefined) return null; this.future.push(JSON.stringify(current)); return JSON.parse(s); }
  redo(current: T): T | null { const s = this.future.pop(); if (s === undefined) return null; this.past.push(JSON.stringify(current)); return JSON.parse(s); }
}
