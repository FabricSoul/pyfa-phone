# pyfa 手机网页版

把 pyfa 做成手机优先的网页应用（Pyodide 跑原版 eos），部署到 Cloudflare Pages，因为玩家需要在手机上得到和桌面 pyfa 完全一致的装配数值。

- Design: `.ryugi/artifacts/document/pyfa-phone-design/doc.xml`
- Read: `ryugi get --artifact document/pyfa-phone-design --detail --project-dir <repo-root>` (through the ryugi:artifacts launcher)
- Scope: `.ryugi/artifacts/document/pyfa-feature-inventory/doc.xml`
- Boards: `artboard/pyfa-phone-design-system` — dir-a; t-color-b, t-type-b, t-size-b, t-depth-b, t-motion-a, t-sheet; l-struct-a, l-row-b, l-add-d, l-act-a, l-home-d, l-sheet; r-row-spec (r-state-b, r-stack-a), r-gauge-spec (r-num-a), r-sheet-spec (r-ammo-b), r-stats-spec (r-res-a); pf-*, pm-*
- Approved: 2026-11-22
