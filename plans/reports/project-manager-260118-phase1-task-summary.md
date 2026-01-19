# Phase 1 Task Summary - Quick Reference

**13 Tasks Total | 2h Effort | Zero Critical Blockers**

---

## Task Execution Order (Optimal)

### Sequential Unblocking
1. **Task 1:** Folder structure (5 min) → unblocks all
2. **Task 3:** message-types.js (5 min) → **CRITICAL: unblocks Tasks 5, 8, 9, 10**

### Phase A: Foundation (can parallelize after Task 3)
- Task 2: manifest.json (15 min)
- Task 4: constants.js (5 min)
- Task 11: icons (10 min)

### Phase B: Components (after Task 3, can parallelize)
- Task 5: service-worker.js (20 min)
- Task 6: popup.html (10 min)
- Task 9: content-script.js (10 min)
- Task 10: offscreen.html/js (10 min)

### Phase C: Sequential Dependents
- Task 7: popup.css (10 min) → after Task 6
- Task 8: popup.js (15 min) → after Task 6 + Task 3

### Phase D: Testing
- Task 12: Load in Chrome (5 min) → after all above
- Task 13: Test messaging (15 min) → final validation

**Total parallel time: ~1.5h | Serial time: ~2h**

---

## Task Dependencies Quick Map

```
1 ────────────┬─→ 2, 3, 4, 11
              │
3 (CRITICAL) ─┼─→ 5, 8, 9, 10
              │
6 ───────────→ 7, 8
              │
2-11 ─────────→ 12 ────→ 13
```

---

## Acceptance Criteria Checklist

| Task | Must Have | Validation |
|------|-----------|-----------|
| 1 | All dirs exist | `ls -R gptcast-extension/` |
| 2 | JSON valid, permissions correct | `jq . manifest.json` succeeds |
| 3 | 10 message types exported | `grep -c "MSG\." message-types.js` |
| 4 | Config constants defined | `grep -c "export const" constants.js` |
| 5 | Service worker loads, no errors | Browser console clean, offscreen function present |
| 6 | HTML valid, all IDs present | `grep -c "id=" popup.html` ≥ 3 |
| 7 | CSS valid, buttons styled | Extension popup renders without layout issues |
| 8 | Message sent on click, no errors | popup console + service worker console both clean |
| 9 | Content script injects, listens | chrome://extensions shows content script active |
| 10 | Offscreen HTML/JS valid | offscreen.js imports MSG, console log present |
| 11 | 4 PNG files exist | `ls assets/icons/icon-*.png` all exist |
| 12 | Extension loads in Chrome | chrome://extensions shows green checkmark |
| 13 | Messages flow popup→SW→CS | Browser console logs confirm message chain |

---

## Critical Alerts

⚠️ **CRITICAL TASK:** Task 3 (message-types.js)
- Blocks 4 components (5, 8, 9, 10)
- Do this second, before any component implementation

⚠️ **UNRESOLVED:** Icon generation tool
- Need ai-multimodal skill or manual PNG creation
- Blocker if tool unavailable (workaround: use simple shapes)

⚠️ **ASSUMED:** Chrome browser available for Task 12
- Verify before starting Phase 1

---

## File References

**All created files in gptcast-extension/ directory:**

```
manifest.json
src/
  ├── background/service-worker.js
  ├── content/content-script.js
  ├── offscreen/
  │   ├── offscreen.html
  │   └── offscreen.js
  ├── popup/
  │   ├── popup.html
  │   ├── popup.css
  │   └── popup.js
  └── shared/
      ├── constants.js
      └── message-types.js
assets/
  └── icons/
      ├── icon-16.png
      ├── icon-32.png
      ├── icon-48.png
      └── icon-128.png
```

---

## Unresolved Questions

1. Should constants.js include encryption stubs for Phase 6, or minimal now?
2. Settings button implementation - full modal or placeholder only?
3. Error handling depth - comprehensive or minimal for Phase 1?
4. Build/package script needed for distribution testing?

---

## Resources

- Chrome MV3 Docs: https://developer.chrome.com/docs/extensions/mv3/
- Phase 1 Full Plan: `./phase-01-extension-scaffold.md`
- Research Reports:
  - `./research/researcher-01-chrome-mv3-audio.md`
  - `./research/researcher-02-gemini-api-integration.md`

