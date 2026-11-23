# PERF1 缓存与引擎启动验证

基线为 `baf0ad4`。2026-11-23 在 Apple M2 上用 Google Chrome 157.0.8103.79、402×874 视口及 DevTools 4× CPU 节流测量。两个版本都先安装生产 Service Worker，各丢弃一次预热，然后取五次刷新中位数。浏览器从 `createEngine` 调到 `ready` 后立即用 Rifter 装配做首次 `calc`。十次热启动中，服务器均收到零个 `/pyodide/*` 和 `/data/*` 请求，新版两项进度都报告 `source: 'cache'`。

## 热启动阶段

| 阶段 | 基线 ms | 修改后 ms | 口径 |
| --- | ---: | ---: | --- |
| Pyodide 加载与包初始化 | 1,099 | 990 | 从导入加载器到 `loadPyodide` 返回。 |
| `loadPackage` 重叠区间 | 1,082 | 968 | 从首个包请求到 `loadPyodide` 返回，包含并行的运行时工作。 |
| `py.zip` 写入与入口导入 | 53 | 28 | 写入 ZIP 和名称文件，再导入桥接模块 `api`。 |
| `eve.db` gzip 解压与 MEMFS 写入 | 274 | 0 | 新版热启动跳过 gzip，MEMFS 持有 OPFS 读取的现有缓冲区，计时四舍五入。 |
| `eve.db` OPFS 准备区间 | — | 1,007 | 从并行工作排队到缓冲区可用，包含 Worker 正忙于初始化 Pyodide 的等待时间。 |
| 导入 eos 与初始化 | 2,437 | 660 | 含 SQLAlchemy 字节码展开和 eos 实际初始化。 |
| 首次 `calc` | 713 | 1,283 | 新版在首次拟合时初始化内置角色和拟合所需的桌面列。 |
| **引擎就绪** | **3,917** | **1,701** | **缩短 56.6%。** |
| **开始启动至首次计算返回** | **4,643** | **3,096** | **缩短 33.3%。** |

五个 `ready` 样本，四舍五入为毫秒。基线 `3917, 3807, 3783, 4094, 4157`，新版 `2154, 1701, 1998, 1690, 1572`。

Chrome DevTools 节流只限制页面主线程。表中 Worker 阶段是同台机器在该设置下的实测墙钟时间，手机实机耗时仍需实机采样。阶段存在重叠，各阶段的中位数也来自独立样本，不能相加作为总耗时。ZIP 由 Python 按需打开，后续模块的解压计入导入阶段。 [Chrome DevTools CPU 节流说明](https://developer.chrome.com/blog/devtools-grounded-real-world)

## 决定与取舍

- 每个游戏数据文件按自己的 SHA 分缓存，清单按自身摘要更新 — 引擎代码变更可继续复用数据库和名称索引。
- 以图标内容为图标缓存版本，并保留现有设置页识别的 `pyfa-` 前缀 — 应用更新后保留已缓存图标，兼容离线图标下载入口。
- 首次切换缓存结构时迁移旧缓存中仍被引用的 Pyodide 路径和数据 SHA — 已缓存的大文件可以跨升级直接复用。
- 游戏库在 OPFS 按 SHA 原子写入，热启动将同一块缓冲区交给 MEMFS — 实验中的 WORKERFS 逐页同步读取比 MEMFS 慢，出现存储异常时则继续走流式解压。
- 给 `py.zip` 加入 Python 3.13 字节码，同时给锁定的 SQLAlchemy wheel 补编译产物 — 这样能减少源码编译并保留 wheel 的原生扩展。Pyodide 资产减少约 2.1 MB，`py.zip` 增加约 4.2 MB，合计首次下载约增加 2.1 MB。
- 延迟文本索引、桌面列和市场服务，以及拟合所需的内置角色创建 — 可更早完成 `ready`，首次触发对应操作时再付出初始化成本。
- 保留 Pyodide 的并行包启动选项，移除 Worker 的 `cryptography` 依赖 — Fernet 只供未启用的桌面令牌功能，调用它会明确失败。
- 进度每阶段可为 `cache` 或 `network`，尚未观察到资源时来源可省略 — 混合阶段用 `network`，`cache` 表示 SW 或 OPFS 命中。未受 SW 控制的浏览器 HTTP 缓存通过普通 fetch 交付，归入 `network`。
- 保持常规引擎启动 — Pyodide 0.29.3 对空解释器可生成并恢复约 20 MiB 快照，仍需重新载入 sqlite3。载入 sqlite3、完整依赖组或完成 eos 初始化后实测 `makeMemorySnapshot()` 都报 `Unexpected hiwire entry at index 6`，无法复用已初始化的引擎状态。 [Pyodide 上游快照支持进展](https://github.com/pyodide/pyodide/pull/6485)

## 验证

- `pnpm exec vitest run src/engine/progress.test.ts` — 新增的两个断言先失败，实现后 3 个测试通过。
- `node --test --test-name-pattern='app deploys' etl/sw.test.mjs` — 原实现使运行时缓存随应用部署被替换，新增测试复现后通过。
- `node --test --test-name-pattern='compatible bytecode' etl/pyodide.test.mjs` — 旧 ZIP 缺少 `.pyc`，打包后验证了 CPython magic 与 SQLAlchemy 字节码。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node etl/perf_startup.mjs` — 五次热启动的阶段计时及 HTTP 请求断言。基线通过在 `baf0ad4` 的临时副本加相同计时点获得，保留原始包加载方式。
- `REMOTE_CHECK_DIR=pyfa-phone-ci-perf1 scripts/remote-check.sh zion` — `53` 个单元测试文件、`323` 个单元测试通过，两端各 `35` 个引擎回归通过，九套 `0 differences`。实际 Chromium Worker 通过 OPFS 热启动复用、断网刷新重算和 HTTP 503 后重试。末尾为 `全部闸门通过 ✅`。

Cloudflare Pages 的 `_headers` 已进入构建产物。生产站点将在合并部署后提供新响应头。 [Cloudflare Pages 静态响应头](https://developers.cloudflare.com/pages/configuration/headers/)
