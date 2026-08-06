import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

function loadTypescriptModule(path, requireFn = () => { throw new Error("Unexpected import"); }) {
  const source = readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", "require", js)(module.exports, module, requireFn);
  return module.exports;
}

const updates = loadTypescriptModule("lib/updates/whatsNew.ts");
const seen = loadTypescriptModule("lib/updates/whatsNewSeen.ts", (specifier) => {
  if (specifier === "./whatsNew") return updates;
  throw new Error(`Unexpected import: ${specifier}`);
});
const entries = updates.WHATS_NEW_ENTRIES;

for (const entry of entries) {
  assert.doesNotThrow(() => updates.parseWhatsNewId(entry.id), `${entry.id} parses`);
  assert.match(entry.id, /^v[1-9]\d*\.(0[1-9]|1[0-2])\.\d{2}$/);
  assert.ok(entry.bullets.length >= 2 && entry.bullets.length <= 5, `${entry.id} has 2–5 bullets`);
  assert.ok(entry.bullets.every((bullet) => bullet.trim()), `${entry.id} bullets are non-empty`);
  if (entry.href) {
    assert.match(entry.href, /^\/(?!\/)/, `${entry.id} href is internal`);
    assert.ok(entry.linkLabel?.trim(), `${entry.id} internal link has a descriptive label`);
  }
}
assert.equal(new Set(entries.map(({ id }) => id)).size, entries.length, "IDs are unique");
assert.equal(updates.validateWhatsNewEntries(entries), true, "monthly sequences start at v1 and have no gaps");
assert.throws(() => updates.validateWhatsNewEntries([...entries, entries[0]]), /Duplicate/, "duplicates fail loudly");
assert.throws(() => updates.parseWhatsNewId("v0.13.26"), /Invalid/, "malformed IDs fail loudly");
const groups = updates.groupWhatsNewEntries(entries);
assert.deepEqual(groups.map(({ heading }) => heading), ["August 2026", "July 2026"], "English month headings are derived newest-first");
assert.deepEqual(groups[0].entries.map(({ id }) => id), ["v4.08.26", "v3.08.26", "v2.08.26", "v1.08.26"], "newest update is first within month");
assert.equal(updates.latestWhatsNewEntry(entries).id, "v4.08.26", "latest update is deterministic");

assert.equal(seen.isLatestWhatsNewUnseen(null, "v4.08.26"), true, "empty seen value is unseen");
assert.equal(seen.isLatestWhatsNewUnseen("v3.08.26", "v4.08.26"), true, "older seen value is unseen");
assert.equal(seen.isLatestWhatsNewUnseen("v4.08.26", "v4.08.26"), false, "latest seen value hides badge");
assert.equal(seen.isLatestWhatsNewUnseen("broken", "v4.08.26"), true, "malformed stored value is safely unseen");
const browserWithThrowingStorageGetter = {};
Object.defineProperty(browserWithThrowingStorageGetter, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
assert.doesNotThrow(() => seen.safeBrowserLocalStorage(browserWithThrowingStorageGetter), "localStorage property acquisition cannot escape");
assert.equal(seen.safeBrowserLocalStorage(browserWithThrowingStorageGetter), null, "blocked localStorage acquisition returns null");
assert.equal(seen.safeBrowserLocalStorage(null), null, "missing browser returns null");
const throwingStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
assert.doesNotThrow(() => seen.readWhatsNewUnseen(throwingStorage, "v4.08.26"));
assert.equal(seen.readWhatsNewUnseen(throwingStorage, "v4.08.26"), false, "failed storage read avoids a permanent broken badge");
assert.doesNotThrow(() => seen.markLatestWhatsNewSeen(throwingStorage, "v4.08.26"));
let stored = null;
let eventName = "";
const memoryStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
const eventTarget = { dispatchEvent: (event) => { eventName = event.type; return true; } };
assert.equal(seen.markLatestWhatsNewSeen(memoryStorage, "v4.08.26", eventTarget), true, "opening page marks latest seen");
assert.equal(stored, "v4.08.26");
assert.equal(eventName, seen.WHATS_NEW_SEEN_EVENT, "same-tab synchronization event is dispatched");
assert.equal(seen.readWhatsNewUnseen(memoryStorage, "v4.08.26"), false, "same-tab refresh removes badge");

const header = readFileSync("app/components/AuthHeader.tsx", "utf8");
const page = readFileSync("app/whats-new/page.tsx", "utf8");
const marker = readFileSync("app/whats-new/WhatsNewSeenMarker.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
assert.match(header, /aria-label="Support"[\s\S]*role="menuitem" href="\/whats-new"[\s\S]*What’s new[\s\S]*Send feedback/, "Support menu contains ordered authenticated link");
assert.match(header, /querySelectorAll<HTMLElement>[\s\S]*a\[role="menuitem"\]/, "menu item remains in keyboard navigation model");
assert.match(header, /WHATS_NEW_SEEN_EVENT[\s\S]*addEventListener\("storage"/, "menu listens for same-tab and cross-tab changes");
assert.match(layout, /<ProfileGate>\{children\}<\/ProfileGate>/, "route uses existing global authenticated gate");
assert.match(page, /<AppBackButton fallback="\/dashboard" \/>/, "page uses safe AppBackButton");
assert.match(header, /readWhatsNewUnseen\(safeBrowserLocalStorage\(window\), latestWhatsNewId\)/, "header guards localStorage property acquisition");
assert.match(marker, /markLatestWhatsNewSeen\(safeBrowserLocalStorage\(window\), latestId, window\)/, "opening page guards storage acquisition and records latest update");
assert.doesNotMatch([header, marker].join("\n"), /window\.localStorage/, "browser callers never acquire localStorage before the shared guard");
assert.match(css, /\.whatsNewPage[\s\S]*width: min\(100% - 24px, 760px\)[\s\S]*overflow-wrap: anywhere/, "mobile page constrains content without horizontal overflow");
assert.ok(!existsSync("app/whats-new/route.ts"), "no API route introduced");
assert.doesNotMatch([page, marker, readFileSync("lib/updates/whatsNewSeen.ts", "utf8")].join("\n"), /supabase|cookie/i, "update page and seen state have no database or cookie state");
assert.match(readFileSync("AGENTS.md", "utf8"), /lib\/updates\/whatsNew\.ts/, "repository instructions name canonical path");
const template = readFileSync(".github/pull_request_template.md", "utf8");
assert.match(template, /lib\/updates\/whatsNew\.ts/, "PR template names canonical update source");
assert.match(template, /Social media consideration/, "PR template requires social decision");

console.log("What's new checks passed");
