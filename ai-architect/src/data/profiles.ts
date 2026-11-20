/** أنظمة البلديات والمناطق المحفوظة: يحفظها المستخدم من اشتراطات أي مشروع ويطبقها على غيره */
import type { Rules } from "./model";
const KEY = "aiarch:profiles";
export interface Profile { id: string; rules: Rules; savedAt: number }
export function listProfiles(): Profile[] { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } }
export function saveProfile(rules: Rules): Profile[] {
  const all = listProfiles().filter(p => p.rules.profileName !== rules.profileName);
  all.push({ id: "r" + Date.now().toString(36), rules: { ...rules }, savedAt: Date.now() });
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* التخزين مقفل */ }
  return all;
}
export function deleteProfile(id: string): Profile[] { const all = listProfiles().filter(p => p.id !== id); try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* */ } return all; }
