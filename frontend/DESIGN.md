# DESIGN.md — GlucoGuide public

Dark/light canvas system. No Impilo marketing mirror.

## Colors
| Token | Hex | Use |
|---|---|---|
| canvas (dark) | `#090909` | Dark page / nav |
| canvas (light) | `#ffffff` | Light page |
| surface-1 | `#141414` / `#f5f5f5` | Cards |
| accent-blue | `#0099ff` | Links / focus only |
| CTA | black↔white pills | Primary actions |

## Loading
Use `thinking-orbs` via `components/loader/ThinkingLoader.tsx` only as a **loader** (route/full-page/inline). It cycles Working → Searching → Solving → Listening → Composing → Breathing. Do not put the orb state picker on marketing pages.
