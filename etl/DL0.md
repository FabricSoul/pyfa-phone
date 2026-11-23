# DL0 · pyfa 显示规则无界面运行可行性

评估基线为 pyfa `34a39e9706727ef43ef557cfa7af05fe6523617c`、pyfa-phone `0f1813b`。按 `DESIGN.md`、首版功能清单和 `dl1.md` 草稿的手机交互范围评估。附录 A–D 逐文件覆盖这四个目录的 263 个已跟踪 Python 文件。

## 结论

| 模块族 | 建议 | 根据 |
| --- | --- | --- |
| `builtinViewColumns` | **原样运行主装配列的文字规则**。图标按上游图标用途映射为网页资源，价格沿用网页报价生命周期。 | 全部 13 个默认列用上游构造函数，文字与提示跨运行时完全一致。列格式化的输入大多清楚。名称的投射分支、电容与过热的活动装配、无人机有效值、图表列各自有额外依赖。 |
| `builtinStatsViews` | **部分原样**。先接电容、火力、资源的文字与提示，保留 eos 数值和 React 的布局、警示及交互。其余面板逐一决定。 | 三个实测面板的文字可以从原版 `populatePanel` / `refreshPanel` 捕获。修改控件、颜色、显示状态和布局检查与数值格式化交织。抗性依赖自定义 gauge 及事件，价格刷新启动桌面异步报价。 |
| `builtinContextMenus` | **部分原样**。用白名单接现有动作的顶层 `display` / `getText`，仍用手机菜单和动作。 | 14 个处理器执行了顶层可见性，13 个在至少一个真实场景产出文案。子菜单分组、可选叶节点、禁用及勾选状态还有各自入口。浏览器、剪贴板、鼠标修饰键和桌面对话框需要单独决策。 |
| `fitCommands` | **部分原样，留给 DL2**。评估选用 `calc/` 的 `Do` / `Undo`，网页保持现有事务、持久化与发布流程。 | 59 个计算命令的直接 wx 边界都是 `wx.Command`，但会按 fitID 修改 eos ORM 对象。83 个 GUI 命令都直接提交数据库事务并发桌面事件，整层复用会把桌面状态所有权带进网页。DL0 对命令只做静态评估。 |

三个家族的显示入口可以保持上游源码原样。维护成本主要落在构造期的对象图、面向手机的字段契约、子菜单内容、数据与作用域兼容性。把现有动态空壳扩展成通用 wx 实现会掩盖调用变化。建议按实际调用路径逐项声明兼容接口。

## 原型结果

用真实 `Engine.build` 构建及计算裂谷级 `rifter` 和忏悔者级 `confessor`，后者含真实战术模式行。第三个场景复制裂谷夹具后仅把第一门炮设为过热，补足九套基准都未覆盖的热损文字。使用真实 eos、`service.fit.Fit`、市场和弹药服务，以及上游的 `ViewColumn`、`StatsView` 和 `ContextMenu` 基类。原型从 `FittingView.DEFAULT_COLS` 的 AST 读取默认列定义，按列注册表执行原构造函数。列的 `getText` / `getToolTip` 各执行一次，覆盖装配槽位、空槽和战术模式行。货柜、无人机等附加栏有自己的列配置。

| 场景 | 默认列调用 | 原版面板刷新 | 顶层菜单 | 示例 |
| --- | --- | --- | --- | --- |
| `rifter` | 13 行 × 13 列 × 2 方法，0 异常 | 5 电容、3 火力、22 资源标签 | 12/18 场景可见 | `750m+9.68km` / `Optimal + Falloff`，`Lasts 1m3s`，CPU 文案 `162.2 / 162.5` |
| `confessor` | 5 行 × 13 列 × 2 方法，0 异常 | 5 电容、3 火力、22 资源标签 | 13/18 场景可见 | `-0.451` / `Capacitor usage`，`Stable: 91.3%`，战术模式可见 |
| `rifterOverheated` | 13 行 × 13 列 × 2 方法，0 异常 | 30 标签 | 12/18 场景可见 | `02:34` / `Estimated time til burnout` |

资源面板每套另外记录 6 个 `SetValueRange` 结果。裂谷 CPU 原始值为 `162.25 / 162.5`，桌面标签显示 `162.2 / 162.5`。火力面板只在缓存值变化时调用 `SetLabel`，因此零无人机 DPS 的构造期初值未计入 30 个写入标签。跨运行时比较覆盖全部捕获内容，包括空值、tooltip、写入次数、槽位文字和资源原始值。

| 输入场景 | 执行的处理器及结果 |
| --- | --- |
| 有弹药的装配模块 | `RemoveItem` → Remove Module、`ItemStats` → Module Stats、`ChangeModuleAmmo` → Charge、`ChangeItemToVariation` → Variations、`FillWithModule` → Fill With Module、`JumpToMarketItem` → Module Market Group。普通武器的 `ChangeModuleSpool` 不显示。 |
| 空模块 | `RemoveItem`、`ItemStats`、`ChangeModuleAmmo` 均不显示。 |
| 市场弹药 | `AmmoToDmgPattern` → Set Charge as Damage Pattern、`AddToCargo` → Add Charge to Cargo、`AddToCargoAmmo` → Add Charge to Cargo (x1000)、`FillCargoWithItem` → Fill Cargo With Charge。 |
| 市场模块 | `FillWithItem` → Fill With Module，`AddToCargoAmmo` 不显示。 |
| 火力与舰船 | `FactorReload` → Factor in Reload Time。 `ChangeShipTacticalMode` 只在忏悔者级返回 Tactical Mode。 |

替身增量是 [`doubles.py`](dl0/doubles.py) 的 **149 个物理行、108 个非空、非独立注释行**（含 docstring）。它复用现有 `headless.py` 的 159 个物理行，新增视图和图标索引、面板假控件和 gauge、MainFrame、导入边界。布局方法为空操作。文本、提示、显示状态、颜色写入和 gauge 输入有具体语义。原型仅装载选定菜单模块，保留真实菜单基类分发和状态传递。

| 实际卡点或未覆盖的分支 | 影响 |
| --- | --- |
| `baseName.py:58` 的 `gui.builtinAdditionPanes.projectedView.ProjectedView` | 普通槽位也在构造期做类型检查。首轮报 `AttributeError`，通过显式导入替身类型解决。 |
| `maxRange.py:76` 的实例 `getParameters(self)` | 原型最初对所有列调用，报 `TypeError`。桌面 `Display.insertColumnBySpec` 只在带参数的列名调用它。原型改成这个调用约定。 |
| 战术 `Mode` 没有 `itemID` | 原型序列化初次报错，改用 `item.ID`。原版 13 列在该模式行均执行成功。 |
| `Fit.getFit` 第一次读取会重新计算、补空位并 `commit` | 这会破坏网页临时装配的 savepoint。原型对已计算的装配显式设 `fit.inited = True`，随后使用真实服务读出装配。具体事务与活跃对象契约应在 DL1 固定。 |
| `Price.getText` 返回 `False` | 这是上游缓存未命中的延迟文本哨兵。调用成功，实时报价及 `delayedText` 路径未测。 |
| 桌面上下文、视觉及本地化 | 原型使用英文，所选根处理器无需修饰键。原型直接执行根处理器，跳过 `ContextMenu.getMenu`。完整菜单注册导入、子菜单、`enabled/isChecked`、动作、控件事件、价格线程以及 `getImageId` 的图标语义未验证。资源颜色和可见性写入也没有进入对拍负载。Pyodide 在 Node 中执行，未量浏览器或手机启动时间。 |

## 原型取舍

- 选裂谷级、忏悔者级和裂谷过热变体，分别覆盖普通装配、战术模式与原夹具缺少的热损分支。
- 沿用真实基类、eos 装配和市场服务，限定替身在桌面边界，便于发现上游规则真正需要的输入。
- 菜单按上下文逐组加载，保留原版分发和状态传递，同时避免把未评估的桌面对话框带进运行原型。
- Node 读取主检出目录已生成的运行时和数据库，因为原型可以用同一游戏库验证 WASM 并保持产品路径只读。

## 复现

在仓库根目录运行。首次子模块初始化时，任务给的 `--reference` 因主检出目录的子模块是 shallow clone 而失败。以下浅克隆命令回到同一固定提交。

```sh
git -c protocol.file.allow=always submodule update --init --depth 1
pnpm install --frozen-lockfile
export DL0_DB=/Users/fabric/pyfa-phone/build/eve.db
uv run --python 3.13 --with sqlalchemy==2.0.51 --with logbook==1.9.2 --with pyyaml --with cryptography python -B etl/dl0/test_probe.py
uv run --python 3.13 --with sqlalchemy==2.0.51 --with logbook==1.9.2 --with pyyaml --with cryptography python -B etl/dl0/probe.py --json > /tmp/pyfa-dl0-cpython.json
node etl/dl0/run_pyodide.mjs /Users/fabric/pyfa-phone/public /tmp/pyfa-dl0-cpython.json
pnpm test
```

`DL0_DB` 指向已经生成的游戏库，游戏 build 为 `3724492`。CPython 的数据库和 Node 使用的 gzip 解压内容通过 SHA-256 确认一致。Node 脚本的第一个参数指定已经跑过 ETL 的 public 目录，第二个参数是 CPython 输出。在 Node 中 SQLite 解压到 MEMFS，NODEFS 只用于读取这个 worktree 的原版 Python 和夹具。现有打包产物提供 `api.py`、`engine.py`、`headless.py`、logbook 替身及包字节码，前三个源文件通过 `cmp` 与当前 worktree 一致。Node 为 v24.22.2，Pyodide 为 0.29.3，CPython 为 3.13.13。

TDD 首轮末尾为 `FAILED (failures=3)`，三个契约都缺少采集实现。补充过热断言时复现 `FAILED (failures=1)`，再添加独立过热输入。CPython 四项断言通过，`service/jargon/resources.py` 发出两条未及时关闭 YAML 文件的 `ResourceWarning`。Node 命令末尾如下。

```text
....
----------------------------------------------------------------------
Ran 4 tests in 6.319s

OK
rifter: 13 rows × 13 default columns × 2 methods, 0 cell errors, 30 labels across 3 panels, 12/18 menu cases visible
confessor: 5 rows × 13 default columns × 2 methods, 0 cell errors, 30 labels across 3 panels, 13/18 menu cases visible
rifterOverheated: 13 rows × 13 default columns × 2 methods, 0 cell errors, 30 labels across 3 panels, 12/18 menu cases visible
CPython / Pyodide: 0 differences in captured payload
```

`pnpm test` 退出 0，末尾 `Test Files 55 passed (55)`、`Tests 367 passed (367)`。jsdom 仍输出已有的 `window.scrollTo` 提示。文件清单与报告逐表核对为 25/25、13/13、57/57、168/168，历史表覆盖全部 41 个提交。

## 两年上游历史

在临时目录克隆 GitHub 上游 bare repo，按提交者日期取 2024-11-23 至 2026-11-23（Toronto，首尾均包括），以默认分支 `master` 的 `eea7d3d9963a072c887656ea9dbb0db6181582f7` 为端点，用 `--since-as-filter` 检查所有祖先，排除 merge 以免重复计数。四目录合并共 41 个非合并提交。按目录分别计是列 20、面板 9、菜单 13、命令 1，跨目录提交会重复。相同口径整个 `gui` 为 78 个（含 merge 为 88 个），与草稿的计数口径不同。

```sh
history=$(mktemp -d /tmp/pyfa-dl0-history.XXXXXX)
git clone --filter=blob:none --bare https://github.com/pyfa-org/Pyfa.git "$history/Pyfa.git"
git --git-dir="$history/Pyfa.git" log --no-merges \
  --since-as-filter=2024-11-23T00:00:00-05:00 --until=2026-11-23T23:59:59-05:00 \
  --format='%h %cs %s' -p eea7d3d9963a072c887656ea9dbb0db6181582f7 -- \
  gui/builtinViewColumns gui/builtinStatsViews gui/builtinContextMenus gui/fitCommands
```

以已经接入的默认列内容和批准的手机功能范围为基准，手工检查每个提交的 diff。历史回放纳入 Heat，沿用 DL1 草稿对所有默认列的评估范围，手机上线入口仍按功能清单决定。**自动 14/41（34.1%），仍需手改 10/41（24.4%），略过 17/41（41.5%）**。只看与此方案有关的 24 个变动，自动吸收 58.3%，仍需手改 41.7%。这是假定已接好对应数据、列及顶层菜单后的历史回放判断。自动包含一条兼容的导入重排，列的新增默认显示、附加面板、子菜单和动作仍受手机映射约束。历史比例依赖该范围，祖先上的后续修复也各按一次计。按路径累计（允许交集）如下。

| 家族 | 自动 | 手改 | 略过 |
| --- | --- | --- | --- |
| 列 | 14/20 | 2/20 | 4/20 |
| 面板 | 1/9 | 3/9 | 5/9 |
| 菜单 | 0/13 | 5/13 | 8/13 |
| 命令 | 0/1 | 0/1 | 1/1 |

| 提交 | 分类 | 手机端影响或适配点 |
| --- | --- | --- |
| [`34a39e97`][c01] | 自动 | Misc 增加同步器改装件的额外信息，随 eos 属性一起更新。 |
| [`efb558a5`][c02] | 自动 | Heat 改从列所属视图取装配。适配器已为电容列提供 `fittingView.getActiveFit()`，保留单独的窗口和视图 ID 即可吸收。 |
| [`49fcf5b7`][c03] | 自动 | Omega 图标规则删技能表 fallback。已映射的 `getImageId` 会跟随，桌面间距略过。 |
| [`f12b9c65`][c04] | 略过 | Omega 固定列宽，网页自行布局。 |
| [`b6855e9f`][c05] | 手改 | 新增 Omega 图标列。可自动发现规则，手机要选显示位置、图标资源及可访问名称。 |
| [`7e4b29a4`][c06] | 略过 | `AttributeDisplay` 的市场直接模式代理了桌面 `refresh`，新增两个参数。主装配默认未启用直接模式。 |
| [`2b5bdcaa`][c07] | 手改 | 十二个面板改走 `StatsView.layoutIfNeeded()`，记录器需要 `GetChildren`、`GetId`、`GetLabel`、`IsShown`。只扫 `wx.*` 检不出来。 |
| [`4fcfa68d`][c08] | 手改 | 抗性 gauge 的 `SetBarColour` 改为 `SetBarColor`，另有资源警示颜色入口改变。React 颜色仍由 token 决定，若执行对应面板需兼容调用。 |
| [`891e7082`][c09] | 自动 | 八列将 MainFrame 导入移进构造器，已有正确模块边界即可吸收这次重排。只检查 import 会漏掉构造时依赖。 |
| [`c5487b1d`][c10] | 略过 | 新 FW 环境效果来自投射子菜单，首轮未接。 |
| [`e5e08fc1`][c11] | 略过 | 增加通用指挥链路。若开放该功能，需新菜单动作、枚举、fitCommands 映射和状态测试。 |
| [`11ac35c5`][c12] | 略过 | 新应用曲线的两项桌面图表操作不属于现有手机伤害随距离交互。 |
| [`fd4c4eb2`][c13] | 自动 | Heat 插槽系数扣掉离线模块，列规则继续使用当前 Fit。 |
| [`8069c0af`][c14] | 自动 | 过热模拟精度、收敛与时长改变，同一列输出自然跟随。 |
| [`5a49d286`][c15] | 略过 | Heat 中只删调试注释。 |
| [`69340b80`][c16] | 略过 | 回退桌面校准警示阈值的 helper。试验采集资源文本，手机警示语义按自身资源条契约。 |
| [`872e152f`][c17] | 自动 | 热吸收按过热枚举筛选，装配槽位之外的异常状态需要运行时覆盖。 |
| [`cd1cabcf`][c18] | 略过 | Heat 删除未使用缓存并修正注释。 |
| [`56410209`][c19] | 手改 | 新增 Heat 默认列。已有代码可执行，手机仍需决定入口、列呈现和性能预算。 |
| [`05fb350d`][c20] | 略过 | 桌面校准溢出颜色与重绘，短期新增了 epsilon 阈值。若决定连警示阈值一起跟上游，另建语义字段并将这一提交和回退重列为手改。 |
| [`82f9ef33`][c21] | 自动 | Misc 混合无人机文案分支随该列复用。附加栏也接入 Misc 时玩家可见。 |
| [`c7074f49`][c22] | 略过 | 已打开装配的桌面标签子菜单增加空装配保护。 |
| [`23e09729`][c23] | 手改 | 战术模式叶节点纠正第三档拼写。顶层 Tactical Mode 不变，手机选档映射需相应更新。 |
| [`6472cabc`][c24] | 手改 | 新 AT 舰船的模式叶节点。引擎静态数据可更新，手机模式命名及次序需确认。 |
| [`f01949d8`][c25] | 手改 | 锁定与机动面板新增远征舱字段。记录器可读到新提示，移动端字段、布局及有数据条件仍需确认。 |
| [`dbb61a8a`][c26] | 自动 | 已接入的 Misc 采矿显示随规则改变，独立 Mining Yield 面板尚需映射。 |
| [`b12adcae`][c27] | 自动 | Misc 的抓钩减速附加信息随原规则更新。 |
| [`72567a71`][c28] | 自动 | Misc 增加采矿晶体效果及文案，依赖同步的游戏数据。 |
| [`ae8405d1`][c29] | 自动 | 移除 Misc 对废弃数据的判断，随游戏库升级。 |
| [`0e6b9b48`][c30] | 手改 | 增加不稳定采矿晶体分组的译名，变更位于弹药子菜单分类路径，根项 Charge 不变。 |
| [`a00a80b4`][c31] | 自动 | Misc 增加远征爆发的数值显示，适用模块会更新。 |
| [`e0e1c1ce`][c32] | 自动 | Misc 修正 BCS 组名判断。 |
| [`b1f048ac`][c33] | 略过 | IHub 相关投射环境效果子菜单。 |
| [`80ced86a`][c34] | 略过 | 桌面统计面板顺序，手机顺序已由设计定稿。 |
| [`de93777f`][c35] | 略过 | 轰炸面板字符串比较修正，该面板首发未接。 |
| [`e79f9796`][c36] | 略过 | 轰炸面板向上取整修正，接入该面板后可自动吸收。 |
| [`6e4ca641`][c37] | 手改 | 填充货柜新增已装货物上下文及动作输入类型。顶层规则可随上游放开，需要把 `Cargo` 绑定到正确的手机动作。 |
| [`46c6381c`][c38] | 手改 | 新增 Fill Cargo With。菜单注册可发现，网页要绑定现有动作和合适入口。 |
| [`7c67f18b`][c39] | 略过 | 投射环境效果增加 Drifter 信标。 |
| [`9ab7e0db`][c40] | 略过 | 投射环境效果增加 Triglavian 胜利效果。 |
| [`7e92b58c`][c41] | 略过 | 投射环境效果增加叛乱压制加成。 |

这段历史中实见视图参数变化、面板控件接口重命名、导入时机变化、新列和新动作。没有找到插件公共构造签名改变的实例。以后要检测新的构造签名或 MainFrame 接口，必须运行注册、构造与相关分支，单靠列出 `wx` 名字不够。

## 建议修改 DL1 草稿

1. **分四批交付，约 8–13 人日。** 默认装配列与同位图标映射 2–3 天，火力/电容/资源面板和提示 2–3 天，现有菜单根项与动作映射 2–3 天，九套对拍、中文、截图和热启动验证 2–4 天。任选迁移抗性、回复、锁定、远程维修、附加栏或其他范围后预计再加 4–7 天。价格线程、所有桌面子菜单和 FitCommands 留待独立估算。
2. **改写步骤 2/3 的数据契约。** 列返回列 ID、原版 text/tooltip、可识别的图标键及延迟价格状态。手机按行和页面选择显示，不直接消费 wx 图片索引。用已载入的 fitID 查找只读 Fit，明确列所属视图与 MainFrame 活动装配是两个上下文。用追加字段的方式先接 UI，原有数字消费者逐项对拍后才删除。
3. **缩小面板承诺。** 先列出三个已验证面板的语义字段和 raw/text/tooltip，必要时同步捕获显隐属性。以控件名映射稳定的网端字段 ID，允许缺省字段，检测未知字段和丢失字段。保留资源超限规则、图表、数值排序、无障碍和价格来源。资源样例中的原值与显示值已经不同，禁止从文本反推精度。
4. **菜单以处理器和上下文绑定动作。** 例如 `ChangeModuleAmmo/fittingModule` 对接现有弹药页，`RemoveItem/fittingModule` 对接手机组操作，`FactorReload/firepowerViewFull` 保持手机每装配覆盖。可见、可用、勾选、文案及叶节点差异各自验收。新增处理器仅报告，由维护者映射动作。子菜单复用应先区分可直接调用的服务函数和需要执行 `getSubMenu` 的规则。
5. **替换全目录 wx 引用闸门。** 只对纳入范围的 import、构造和执行入口设显式兼容检查，记录实际触达的控件成员、GUI 服务及方法形状。合并九套 CPython/WASM 对拍、真实 UI 映射断言和针对性分支用例，包括会变的 tooltip、过热、缺失价格、空槽、多选、切换装配与中英切换。用稳定的 gettext 代理按请求选语言，因为上游模块 import 时就绑定了 `_t = wx.GetTranslation`。真实上游变更的回放至少选一条纯规则和一条适配面变更。保留 DL1 原计划的手机热启动基线及 10% 触发线。
6. **确认 DL2 事务方案后再接命令。** 先用本地模块换弹、状态、删除做最小计算命令试验，核对 Do/Undo、目标槽位、嵌套事务及 FitDoc 回写。跨投射、变异、复合命令和价格事件再评估。先由一层拥有事务和撤销栈。

## 逐文件评估读法

难度按文件主要功能评估。菜单分数以顶层可见性和文案为主，子菜单或动作切入时的桌面接口在同一行标明。命令分数按执行和撤销评估。低表示确定参数或数据兼容后可执行，中表示需要有语义的视图、输入或对象状态，高表示涉及桌面 UI、异步生命周期或多个有副作用的状态边界。

`wx` 列记录直接静态引用，包括只在构造、子菜单或动作执行时使用的接口。公共基类/模块保留上游实现。 `GUI` 列列出额外边界和主要依赖，列中的 `imageList` 指 `fittingView.imageList.GetImageIndex`，`MainFrame` 指 `gui.mainFrame.MainFrame.getInstance()`，`GE` 指 `gui.globalEvents`。只要复用对应入口，依赖可由真实服务或明确的替身提供。

### A · `gui/builtinViewColumns`

共 25 文件，其中 24 列，8 个文件直接取 MainFrame。公用 `ViewColumn` 构造还有 `wx.LIST_AUTOSIZE_USEHEADER` 和 `wx.NullBitmap`。默认列包括 State、Omega、Ammo Icon、Base Icon、Base Name、attr:power、attr:cpu、Capacitor Usage、Max Range、Miscellanea、Price、Ammo、Heat。

| 文件 | 耦合 | wx 名字 | GUI 边界 | 难度与理由 |
| --- | --- | --- | --- | --- |
| `__init__.py` | 入口 | — | — | 低 · 空包。列在基类的显式 import 中注册。 |
| `abilities.py` | MainFrame 构造 | `GetTranslation`, `LIST_MASK_TEXT` | `MainFrame` | 低 · 按实际 Fighter 的已启用能力拼名称。构造期取 MainFrame。 |
| `ammo.py` | 数据规则 | `LIST_MASK_IMAGE` | `bitmap_loader.BitmapLoader`, `imageList`, `ViewColumn.columns` | 低 · 按弹药数量和周期生成文字。Fighter 分支从列注册表调用 Abilities。 |
| `ammoIcon.py` | 数据规则 | `LIST_MASK_IMAGE` | `imageList` | 低 · 提示来自弹药名，图标依赖图像索引。 |
| `attributeDisplay.py` | 数据规则 / 视图状态 | `LIST_MASK_IMAGE` | `bitmap_loader.BitmapLoader`, `imageList`, `fittingView.refresh` | 中 · 默认 PG/CPU 直接读属性。直接市场模式会替换视图 refresh 并批量查询。 |
| `attributeDisplayGraph.py` | 数据规则 | `LIST_MASK_TEXT` | `bitmap_loader.BitmapLoader`, `imageList` | 中 · 依赖图表 wrapper 与聚合的 DPS、维修、目标属性。 |
| `baseIcon.py` | 数据规则 | `LIST_MASK_IMAGE` | `imageList` | 低 · 根据类型选择舰船、槽位、角色、目标和物品图标。 |
| `baseName.py` | MainFrame / 视图类型 | `GetTranslation`, `LIST_MASK_TEXT` | `MainFrame`, `frame.getActiveFit`, `builtinAdditionPanes.projectedView.ProjectedView` | 中 · 构造就检查 ProjectedView。有效名称、堆数、槽分隔和投射装配还读设置或活动 Fit。 |
| `capacitorUse.py` | 视图 / Fit 单例 | `LIST_MASK_IMAGE` | `bitmap_loader.BitmapLoader`, `imageList`, `fittingView.getActiveFit` | 中 · 以所属视图装配 ID 计算耗电或回充差。 |
| `dampScanRes.py` | 数据规则 | `LIST_MASK_IMAGE` | `bitmap_loader.BitmapLoader`, `imageList` | 低 · 图表 wrapper 解包后显示扫描分辨率倍率。 |
| `droneEhp.py` | MainFrame / 面板状态 | `GetTranslation`, `LIST_MASK_IMAGE`, `LIST_MASK_TEXT` | `bitmap_loader.BitmapLoader`, `MainFrame`, `frame.statsPane.nameViewMap`, `imageList` | 中 · 从抗性面板取有效生命开关后算无人机/舰载机 EHP。 |
| `droneRegen.py` | MainFrame / 面板状态 | `GetTranslation`, `LIST_MASK_IMAGE`, `LIST_MASK_TEXT` | `bitmap_loader.BitmapLoader`, `MainFrame`, `frame.statsPane.nameViewMap`, `imageList` | 中 · 有效回复还引用拥有装配的伤害模式。 |
| `graphColor.py` | 数据规则 / 图表状态 | `LIST_MASK_TEXT` | `imageList` | 低 · 按 SourceWrapper 的颜色 ID 查图表样式图标。 |
| `graphLightness.py` | 数据规则 / 图表状态 | `LIST_MASK_TEXT` | `imageList` | 低 · 按 TargetWrapper 的明度 ID 查图标。 |
| `graphLineStyle.py` | 数据规则 / 图表状态 | `LIST_MASK_TEXT` | `imageList` | 低 · 根据图表 wrapper 的线型选择图标。 |
| `heat.py` | 视图 / Fit 单例 | `LIST_MASK_IMAGE` | `bitmap_loader.BitmapLoader`, `imageList`, `fittingView.getActiveFit` | 中 · 过热分支用整套装配和槽位顺序模拟热损。 |
| `maxRange.py` | 数据规则 | `LIST_MASK_IMAGE`, `LIST_MASK_TEXT` | `bitmap_loader.BitmapLoader`, `imageList` | 低 · 使用最大射程、失准与 Mode 分支，构造取属性图标。 |
| `misc.py` | 数据规则 / MainFrame | `LIST_MASK_IMAGE`, `LIST_MASK_TEXT` | `bitmap_loader.BitmapLoader`, `MainFrame`, `frame.statsPane.nameViewMap`, `imageList`, `fittingView.getActiveFit` | 中 · 按数十类物品选字段。辅助维修支路还读活动装配及有效生命。 |
| `omega.py` | 数据规则 | `LIST_MASK_IMAGE` | `imageList` | 低 · 文字用基类默认值。自有规则在图标分支，读取 cloneGradeRestriction。 |
| `price.py` | 数据规则与异步列表 | `LIST_MASK_IMAGE` | `bitmap_loader.BitmapLoader`, `imageList`, `Display.SetItem`, `listItem.SetText` | 高 · 同步显示价格缓存。未命中时延迟回调写列表项。 |
| `projectionRange.py` | MainFrame / 投射状态 | `LIST_MASK_IMAGE` | `bitmap_loader.BitmapLoader`, `MainFrame`, `frame.getActiveFit`, `imageList` | 中 · Fit 的投射距离由主窗口活动装配确定。 |
| `propertyDisplay.py` | 数据规则 | — | `imageList` | 低 · 参数指定对象属性和元数据，按需映射图标。 |
| `sideEffects.py` | MainFrame 构造 | `GetTranslation`, `LIST_MASK_TEXT` | `MainFrame` | 低 · 按 Booster 已启用副作用拼文字。构造期取单例。 |
| `state.py` | MainFrame / 视图类型 | `LIST_MASK_IMAGE` | `MainFrame`, `frame.getActiveFit`, `imageList`, `fittingView 类名 CommandView` | 中 · 状态和提示按对象类型，图标有 CommandView 和投射 Fit 路径。 |
| `targetResists.py` | 数据规则 / 图表状态 | `LIST_MASK_TEXT` | `bitmap_loader.BitmapLoader`, `imageList` | 中 · 要求真实 TargetWrapper、抗性模式、目标层和属性。 |

### B · `gui/builtinStatsViews`

共 13 文件，其中 12 面板，6 个文件含 MainFrame 访问。所有实现都含控件操作。公用 `StatsView.layoutIfNeeded` 需要真实语义的 `GetChildren`、`GetLabel`、`GetId`、`IsShown` 以及空布局方法。

| 文件 | 耦合 | wx 名字 | GUI 边界 | 难度与理由 |
| --- | --- | --- | --- | --- |
| `__init__.py` | 入口 | — | — | 低 · 声明 __all__，由基类显式 import 实际面板。 |
| `bombingViewFull.py` | 规则与控件交织 / MainFrame | `ALIGN_CENTER`, `EXPAND`, `FlexGridSizer`, `GetTranslation`, `ID_ANY`, `StaticText`, `ToolTip` | `bitmap_loader.BitmapLoader`, `MainFrame` | 中 · 炸弹伤害、爆炸半径与 EHP 推导次数，更新多个伤害类型和等级的标签和提示。 |
| `capacitorViewFull.py` | 规则与控件交织 | `ALIGN_CENTER`, `ALIGN_CENTER_HORIZONTAL`, `ALIGN_LEFT`, `BoxSizer`, `EXPAND`, `GetTranslation`, `GridSizer`, `HORIZONTAL`, `ID_ANY`, `LEFT`, `StaticText`, `ToolTip`, `VERTICAL` | `bitmap_loader.BitmapLoader`, `panel.GetSizer`, `layoutIfNeeded 控件接口` | 中 · 可记录稳定率、耗尽时长、用量和抗毁电。需要布局读取和标签记录。 |
| `firepowerViewFull.py` | 规则与控件交织 / 窗口状态 | `ALIGN_CENTER`, `ALIGN_CENTER_HORIZONTAL`, `ALIGN_LEFT`, `ALIGN_RIGHT`, `ALL`, `BitmapButton`, `BoxSizer`, `EVT_BUTTON`, `EXPAND`, `FlexGridSizer`, `GetTranslation`, `GridSizer`, `HORIZONTAL`, `ID_ANY`, `StaticText`, `ToolTip`, `VERTICAL` | `bitmap_loader.BitmapLoader`, `MainFrame`, `frame.getActiveFit`, `header.Parent.GetHeaderContentSizer`, `parent.views` | 中 · 有效标记、缓存、预热、伤害分布与提示。按钮回调另需面板注册及替换。 |
| `miningyieldViewFull.py` | 规则与控件交织 / 窗口状态 | `ALIGN_CENTER`, `ALIGN_CENTER_HORIZONTAL`, `ALIGN_LEFT`, `BitmapButton`, `BoxSizer`, `EVT_BUTTON`, `EXPAND`, `FlexGridSizer`, `GetTranslation`, `HORIZONTAL`, `ID_ANY`, `StaticText`, `ToolTip`, `VERTICAL` | `bitmap_loader.BitmapLoader`, `MainFrame`, `frame.getActiveFit`, `header.Parent.GetHeaderContentSizer`, `parent.views` | 中 · 按挖掘类别格式化收益/损耗。按钮回到火力并修改父控件。 |
| `outgoingViewFull.py` | 规则与控件交织 | `ALIGN_CENTER`, `ALIGN_LEFT`, `BoxSizer`, `EXPAND`, `GetTranslation`, `GridSizer`, `ID_ANY`, `StaticText`, `ToolTip`, `VERTICAL` | `bitmap_loader.BitmapLoader` | 中 · 按远程维修类别更新标签、预热提示和静态图标。 |
| `outgoingViewMinimal.py` | 规则与控件交织 | `ALIGN_CENTER`, `ALIGN_LEFT`, `BoxSizer`, `EXPAND`, `GetTranslation`, `GridSizer`, `ID_ANY`, `StaticText`, `ToolTip`, `VERTICAL` | — | 中 · 精简面板仍更新类别标签和预热提示。 |
| `priceViewFull.py` | 规则与控件交织 / 异步 | `ALIGN_CENTER`, `ALIGN_LEFT`, `ALIGN_TOP`, `ALL`, `BoxSizer`, `EXPAND`, `GetTranslation`, `GridSizer`, `HORIZONTAL`, `ID_ANY`, `StaticText`, `ToolTip`, `VERTICAL` | `bitmap_loader.BitmapLoader`, `header.GetParent().AddToggleItem`, `service.price.Price` | 高 · refreshPanel 启动报价并注册回调，更改标题状态，汇总受市场设置约束。 |
| `priceViewMinimal.py` | 规则与控件交织 / 异步 | `ALIGN_CENTER`, `ALIGN_LEFT`, `ALIGN_TOP`, `ALL`, `BoxSizer`, `EXPAND`, `GetTranslation`, `GridSizer`, `HORIZONTAL`, `ID_ANY`, `StaticText`, `ToolTip`, `VERTICAL` | `bitmap_loader.BitmapLoader`, `service.price.Price` | 高 · 同一异步价格链路，少一些桌面字段。 |
| `rechargeViewFull.py` | 规则与控件交织 / MainFrame | `ALIGN_CENTER`, `ALIGN_CENTRE`, `ALIGN_RIGHT`, `BoxSizer`, `EXPAND`, `FlexGridSizer`, `GetTranslation`, `HORIZONTAL`, `ID_ANY`, `StaticText`, `ToolTip` | `bitmap_loader.BitmapLoader`, `GE`, `MainFrame`, `frame.Bind`, `frame.getActiveFit`, `parent.nameViewMap` | 中 · 按抗性切换选择原始或有效维修与单位，绑定有效生命事件。 |
| `resistancesViewFull.py` | 规则与控件交织 / MainFrame | `ALIGN_CENTER`, `BU_EXACTFIT`, `BoxSizer`, `Button`, `Colour`, `EVT_BUTTON`, `EXPAND`, `Font`, `GBPosition`, `GBSpan`, `GetTranslation`, `GridBagSizer`, `HORIZONTAL`, `ID_ANY`, `NORMAL`, `PostEvent`, `SWISS`, `Size`, `StaticLine`, `StaticText`, `ToolTip`, `VERTICAL` | `bitmap_loader.BitmapLoader`, `GE`, `MainFrame`, `pyfa_gauge.PyGauge`, `utils.fonts`, `frame.Bind`, `frame.getActiveFit` | 高 · 自定义 gauge 绘制和写值，协调 EHP 与 HP、伤害模式事件及颜色插值。 |
| `resourcesViewFull.py` | 规则与控件交织 / 窗口状态 | `ALIGN_BOTTOM`, `ALIGN_CENTER`, `ALIGN_LEFT`, `BoxSizer`, `EXPAND`, `Font`, `GetTranslation`, `HORIZONTAL`, `ID_ANY`, `LEFT`, `NORMAL`, `SWISS`, `SYS_COLOUR_WINDOWTEXT`, `StaticLine`, `StaticText`, `SystemSettings.GetColour`, `ToolTip`, `VERTICAL` | `bitmap_loader.BitmapLoader`, `chrome_tabs.EVT_NOTEBOOK_PAGE_CHANGED`, `MainFrame`, `pyfa_gauge.PyGauge`, `utils.dark.warningTextColor`, `utils.fonts`, `frame.additionsPane.getName`, `frame.additionsPane.notebook.Bind` | 中 · 数值、颜色和 gauge 同一轮更新，构造依赖附加栏 notebook。需模拟文本尺寸与显隐。 |
| `targetingMiscViewMinimal.py` | 规则与控件交织 | `ALIGN_LEFT`, `ALL`, `BoxSizer`, `EXPAND`, `FlexGridSizer`, `GetTranslation`, `HORIZONTAL`, `ID_ANY`, `StaticLine`, `StaticText`, `ToolTip`, `VERTICAL` | — | 中 · 锁定时间、舰船属性和舱容生成动态提示，使用缓存和逐标签条件。 |

### C · `gui/builtinContextMenus`

共 57 文件，顶层 51 文件（含包入口），其中 50 个含 `display`，其余文件在 `shared/` 和 `targetProfile/`。递归有 53 个文件含 `display`，52 个文件取 MainFrame，32 个文件调 Fit 服务，21 个文件自定义 `getSubMenu`。这些是整文件计数，查到的接口有些仅用于动作。真实 `ContextMenu.getMenu` 公共路径额外需要 `wx.GetMouseState/GetModifiers`、`MOD_CONTROL`、`Menu/MenuItem`、`Bitmap`、`ITEM_NORMAL/ITEM_CHECK`、`EVT_MENU`、`NewId` 与 `ContextMenuSettings`。

| 文件 | 耦合 | wx 名字 | GUI 边界 | 难度与理由 |
| --- | --- | --- | --- | --- |
| `__init__.py` | 入口 | — | — | 高 · 一次导入完整注册表，传递依赖动作与桌面编辑器。 |
| `additionsExportAll.py` | 窗口状态 / MainFrame | `GetTranslation` | `MainFrame`, `utils.clipboard.toClipboard`, `frame.getActiveFit`, `callingWindow 的列表数据` | 高 · 可见性查询 callingWindow 的实际附加栏数据，动作要剪贴板。 |
| `additionsExportSelection.py` | 选区 / MainFrame | `GetTranslation` | `MainFrame`, `utils.clipboard.toClipboard`, `frame.getActiveFit`, `callingWindow 的列表数据` | 中 · 依赖多选及活动菜单类别，复制在动作阶段。 |
| `additionsImport.py` | 窗口状态 / MainFrame | `GetTranslation` | `fitCommands`, `MainFrame`, `utils.clipboard.fromClipboard`, `frame.command.Submit`, `frame.getActiveFit`, `clipboard` | 高 · display 直接读取剪贴板，有权限与异步边界。 |
| `ammoToDmgPattern.py` | MainFrame / 数据规则 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame`, `frame.getActiveFit` | 中 · 需要活动 Fit，按弹药的四种伤害属性决定。 |
| `boosterSideEffects.py` | MainFrame / 数据规则 | `EVT_MENU`, `GetTranslation`, `ITEM_CHECK`, `Menu`, `MenuItem`, `PlatformInfo` | `fitCommands`, `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 只显示已实现的副作用，勾选菜单再走 wx。 |
| `cargoAdd.py` | MainFrame / Fit 单例 | `GetTranslation` | `MainFrame`, `frame.additionsPane.select`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 有效 Fit 和建筑筛选由真实服务决定。 |
| `cargoAddAmmo.py` | MainFrame / 数据规则 | `GetTranslation` | `MainFrame`, `frame.additionsPane.select`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 按市场弹药分类，探针 x8、普通弹药 x1000。 |
| `cargoFill.py` | MainFrame / 数据规则 | `GetTranslation` | `MainFrame`, `frame.additionsPane.select`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 市场商品/弹药和现有 Cargo 分开。体积及修改仅在动作。 |
| `commandFitAdd.py` | MainFrame / 窗口状态 | `EVT_MENU`, `GetTranslation`, `Menu`, `MenuItem`, `PlatformInfo` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit`, `CommandView` | 高 · 使用查询生成的指挥装配池和当前视图，菜单按舰种分组。 |
| `commandLinkAdd.py` | MainFrame / 数据规则 | `EVT_MENU`, `GetTranslation`, `Menu`, `MenuItem`, `PlatformInfo` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit`, `CommandView` | 中 · 指挥视图中可见，叶菜单定义等级、mindlink 和分类。 |
| `damagePatternChange.py` | MainFrame / 窗口状态 | `EVT_MENU`, `GetTranslation`, `ITEM_CHECK`, `Menu`, `MenuItem`, `PlatformInfo`, `PostEvent` | `GE`, `MainFrame`, `frame.getActiveFit` | 中 · 顶层文案依赖伤害模式服务的树，部分项有子菜单和勾选。 |
| `droneAddStack.py` | MainFrame / 数据规则 | `GetTranslation` | `MainFrame`, `frame.additionsPane.select`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 显示名含基于类型与无人机数量限制的堆数。 |
| `droneSplitStack.py` | MainFrame / 数据规则 | `ALL`, `BOTTOM`, `BoxSizer`, `CANCEL`, `DEFAULT_DIALOG_STYLE`, `Dialog`, `EVT_CHAR`, `EVT_TEXT_ENTER`, `EXPAND`, `GetTranslation`, `ID_ANY`, `ID_OK`, `LEFT`, `OK`, `RIGHT`, `StaticLine`, `StaticText`, `TE_PROCESS_ENTER`, `TextCtrl`, `VERTICAL` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 堆数大于一可见。动作创建数量对话框。 |
| `envEffectAdd.py` | MainFrame / 上下文 | `EVT_MENU`, `GetTranslation`, `Menu`, `MenuItem`, `PlatformInfo` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 低 · 根项只检查投射上下文，环境效果树在子菜单计算。 |
| `factorReload.py` | MainFrame / 上下文 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame`, `frame.getActiveFit` | 低 · 按火力面板出现。enabled 与 checked 各自需要 Fit 或服务设置。 |
| `fighterAbilities.py` | MainFrame / 选区 | `EVT_MENU`, `GetMouseState`, `GetTranslation`, `ITEM_CHECK`, `MOD_ALT`, `MOD_CONTROL`, `Menu`, `MenuItem`, `PlatformInfo` | `fitCommands`, `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 按舰载机上下文出现，叶项状态、鼠标修饰键在子菜单与动作。 |
| `fitAddBrowse.py` | MainFrame / 上下文 | `GetTranslation`, `ID_OK` | `fitBrowserLite.FitBrowserLiteDialog`, `MainFrame` | 中 · 根项按上下文出现，导入原版浏览对话框有传递依赖。 |
| `fitAddCurrentlyOpen.py` | MainFrame / 窗口状态 | `EVT_MENU`, `GetTranslation`, `Menu`, `MenuItem`, `PlatformInfo` | `builtinViews.emptyView.BlankPage`, `MainFrame`, `frame.fitMultiSwitch._pages`, `frame.getActiveFit` | 高 · 子菜单读 fitMultiSwitch 的桌面标签及 BlankPage。 |
| `fitOpenNewTab.py` | MainFrame / 窗口状态 | `GetTranslation`, `PostEvent` | `builtinShipBrowser.events.FitSelected`, `MainFrame`, `frame.getActiveFit` | 中 · 比较活动 Fit 与选中装配 ID，并要求相应 wrapper。 |
| `fitPilotSecurity.py` | MainFrame / Fit 单例 | `ALL`, `BOTTOM`, `BoxSizer`, `CANCEL`, `DEFAULT_DIALOG_STYLE`, `Dialog`, `EVT_CHAR`, `EVT_MENU`, `EVT_TEXT_ENTER`, `EXPAND`, `GetTranslation`, `ID_ANY`, `ID_OK`, `ITEM_CHECK`, `LEFT`, `Menu`, `MenuItem`, `OK`, `PlatformInfo`, `RIGHT`, `StaticLine`, `StaticText`, `TE_PROCESS_ENTER`, `TextCtrl`, `VERTICAL` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 按特定舰船名出现，预置值和自定义输入走子菜单与对话框。 |
| `fitSystemSecurity.py` | MainFrame / Fit 单例 | `EVT_MENU`, `GetTranslation`, `ITEM_CHECK`, `Menu`, `MenuItem`, `PlatformInfo` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 建筑条件，安全等级预设走子菜单。 |
| `graphAmmoOptimalApplyProjected.py` | MainFrame / 图表状态 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame` | 低 · 根项是上下文常量，勾选值来自 GraphSettings。 |
| `graphAmmoOptimalIgnoreResists.py` | MainFrame / 图表状态 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame` | 低 · 在弹药优选图显示，勾选状态取设置。 |
| `graphDmgApplyProjected.py` | MainFrame / 图表状态 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame` | 低 · 只按伤害图上下文出现，勾选走 GraphSettings。 |
| `graphDmgDroneMode.py` | MainFrame / 图表状态 | `EVT_MENU`, `GetTranslation`, `ITEM_CHECK`, `Menu`, `MenuItem`, `PlatformInfo`, `PostEvent` | `GE`, `MainFrame` | 低 · 根项只看伤害图，模式选项和事件属于子菜单。 |
| `graphDmgIgnoreResists.py` | MainFrame / 图表状态 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame` | 低 · 伤害图根项和抗性开关设置。 |
| `graphDroneControlRange.py` | MainFrame / 图表状态 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame` | 低 · 在伤害、维修、电子战三个图表出现。 |
| `graphFitAmmoPicker.py` | 窗口状态 / 规则与控件交织 | `ALL`, `BU_EXACTFIT`, `BoxSizer`, `Button`, `CANCEL`, `CheckBox`, `DEFAULT_DIALOG_STYLE`, `EVT_BUTTON`, `EVT_CHAR_HOOK`, `EVT_RADIOBUTTON`, `EXPAND`, `GetTranslation`, `HORIZONTAL`, `ID_ANY`, `LEFT`, `MOD_NONE`, `OK`, `RB_GROUP`, `RadioButton`, `ScrolledCanvas.__init__`, `Size`, `StaticText`, `VERTICAL`, `WXK_ESCAPE` | `auxWindow.AuxiliaryDialog`, `builtinAdditionPanes.droneView.DroneView`, `builtinAdditionPanes.fighterView.FighterDisplay`, `MainFrame`, `callingWindow.graphFrame.getView` | 高 · display 读取 callingWindow.graphFrame.getView，文件还定义完整弹药对话框。 |
| `graphLockRange.py` | MainFrame / 图表状态 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame` | 低 · 三类图表共用开关，勾选由设置读取。 |
| `implantSetApply.py` | 数据规则 / 菜单控件 | `EVT_MENU`, `GetTranslation`, `Menu`, `MenuItem`, `PlatformInfo` | — | 中 · display 查询用户和预制植入体套装，子菜单分档。 |
| `implantSetSave.py` | MainFrame / 窗口状态 | `ALL`, `BOTTOM`, `BoxSizer`, `CANCEL`, `DEFAULT_DIALOG_STYLE`, `Dialog`, `EVT_TEXT_ENTER`, `EXPAND`, `GetTranslation`, `ID_ANY`, `ID_OK`, `LEFT`, `OK`, `RIGHT`, `StaticLine`, `StaticText`, `TE_PROCESS_ENTER`, `TextCtrl`, `VERTICAL` | `MainFrame`, `setEditor.ImplantSetEditor`, `frame.getActiveFit` | 高 · 根据 Fit/角色植入体集合出现，保存通过对话框和编辑器。 |
| `itemAmountChange.py` | MainFrame / 选区 | `ALL`, `BOTTOM`, `BoxSizer`, `CANCEL`, `DEFAULT_DIALOG_STYLE`, `Dialog`, `EVT_CHAR`, `EVT_TEXT_ENTER`, `EXPAND`, `GetTranslation`, `ID_ANY`, `ID_OK`, `LEFT`, `OK`, `RIGHT`, `StaticLine`, `StaticText`, `TE_PROCESS_ENTER`, `TextCtrl`, `VERTICAL` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 根项按类型与选区，货柜量及其他量用不同文案，动作需要输入。 |
| `itemFill.py` | MainFrame / 数据规则 | `GetTranslation` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 只为市场中的 Module 提供填槽。 |
| `itemMarketJump.py` | MainFrame / 数据规则 | `GetTranslation` | `MainFrame`, `frame.marketBrowser.jump`, `frame.notebookBrowsers.SetSelection` | 中 · 市场服务返回真实分组与变异品 fallback，跳转走桌面页面。 |
| `itemMutations.py` | MainFrame / 数据规则 | `EVT_MENU`, `GetTranslation`, `Menu`, `MenuItem`, `PlatformInfo` | `fitCommands.GuiConvertMutatedLocalDroneCommand`, `fitCommands.GuiConvertMutatedLocalModuleCommand`, `fitCommands.GuiRevertMutatedLocalDroneCommand`, `fitCommands.GuiRevertMutatedLocalModuleCommand`, `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 高 · 顶层区分应用与还原，构造导入具体 Gui 命令，变异选项在子菜单。 |
| `itemProject.py` | MainFrame / Fit 单例 | `GetTranslation` | `MainFrame`, `frame.additionsPane.select`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 活动装配和建筑限制，物品必须有投射类型。 |
| `itemProjectionRange.py` | MainFrame / 选区 | `ALL`, `BOTTOM`, `BoxSizer`, `CANCEL`, `DEFAULT_DIALOG_STYLE`, `Dialog`, `EVT_CHAR`, `EVT_TEXT_ENTER`, `EXPAND`, `GetMouseState`, `GetTranslation`, `ID_ANY`, `ID_OK`, `LEFT`, `MOD_ALT`, `MOD_CONTROL`, `OK`, `RIGHT`, `StaticLine`, `StaticText`, `TE_PROCESS_ENTER`, `TextCtrl`, `VERTICAL` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 按投射类型排除独占环境效果，动作读鼠标并显示范围对话框。 |
| `itemRemove.py` | MainFrame / 选区 | `GetMouseState`, `GetTranslation`, `MOD_ALT`, `MOD_CONTROL` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 低 · 可见性检查上下文和空槽，文案依赖 display 设置的 srcContext。 |
| `itemStats.py` | MainFrame / 窗口状态 | `DefaultPosition`, `DefaultSize`, `GetMouseState`, `GetTranslation`, `MOD_SHIFT` | `itemStats.ItemStatsFrame`, `MainFrame`, `frame.GetActiveStatsWindow`, `frame.getActiveFit` | 中 · 根项按物品、上下文及空槽。实际统计窗口与 Shift 复用另需边界。 |
| `itemVariationChange.py` | MainFrame / 选区 | `EVT_MENU`, `GetMouseState`, `GetTranslation`, `MOD_ALT`, `MOD_CONTROL`, `Menu`, `MenuItem`, `PlatformInfo` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 使用市场变体列表及当前物品，子菜单处理 Fit 限制、分组、排序。 |
| `moduleAmmoChange.py` | MainFrame / 选区 | `EVT_MENU`, `GetMouseState`, `GetTranslation`, `ID_ANY`, `MOD_ALT`, `MOD_CONTROL`, `Menu`, `MenuItem`, `PlatformInfo` | `bitmap_loader.BitmapLoader`, `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 根项用真实服务找兼容弹药。伤害及矿石分组、按钮与 Alt 操作在子菜单和动作。 |
| `moduleFill.py` | MainFrame / 数据规则 | `GetTranslation` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 低 · 顶层仅检查装配模块及空槽，填满行为属于动作。 |
| `moduleMutatedExport.py` | MainFrame / 数据规则 | `GetTranslation` | `MainFrame`, `utils.clipboard.toClipboard`, `frame.getActiveFit` | 中 · 活动 Fit 的变异模块才显示，动作走剪贴板与序列化。 |
| `moduleRahPattern.py` | MainFrame / 数据规则 | `EVT_MENU`, `GetTranslation`, `ITEM_CHECK`, `Menu`, `MenuItem`, `PlatformInfo`, `PostEvent` | `GE`, `MainFrame`, `frame.getActiveFit` | 中 · 按反应装甲增强器分组出现，伤害模式数据形成子菜单。 |
| `moduleSpool.py` | MainFrame / 数据规则 | `EVT_MENU`, `GetTranslation`, `ITEM_CHECK`, `Menu`, `MenuItem`, `PlatformInfo` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 按先驱武器或自适应远修出现，预热步长与当前值走子菜单。 |
| `priceOptions.py` | MainFrame / 面板状态 | `GetTranslation`, `PostEvent` | `GE`, `MainFrame`, `frame.getActiveFit` | 低 · 两个价格面板触发，勾选单独从设置读。 |
| `resistMode.py` | MainFrame / 图表状态 | `EVT_MENU`, `GetTranslation`, `ITEM_CHECK`, `Menu`, `MenuItem`, `PlatformInfo`, `PostEvent` | `MainFrame` | 中 · 目标 wrapper、图表忽略抗性设置、实际 Fit 共同决定。 |
| `shared/__init__.py` | 入口 | — | — | 低 · 共享包入口。 |
| `shared/patterns.py` | 数据规则 | `GetTranslation` | `utils.sorter.smartSort` | 低 · 供菜单使用的伤害模式分组，依赖真实排序和翻译 helper。 |
| `shipJump.py` | MainFrame / 窗口状态 | `GetTranslation`, `PostEvent` | `builtinShipBrowser.events.Stage3Selected`, `MainFrame`, `frame.getActiveFit`, `frame.notebookBrowsers.GetSelection`, `frame.notebookBrowsers.SetSelection`, `frame.shipBrowser.GetActiveStage`, `frame.shipBrowser.GetStageData` | 高 · display 比较 notebook 页、浏览器阶段和船 ID。 |
| `shipModeChange.py` | MainFrame / Fit 单例 | `EVT_MENU`, `GetTranslation`, `ITEM_RADIO`, `Menu`, `MenuItem`, `PlatformInfo` | `MainFrame`, `frame.command.Submit`, `frame.getActiveFit` | 中 · 活动装配查战术档位；顶层根项与可选档位分离。 |
| `skillAffectors.py` | MainFrame / Fit 单例 | `EVT_MENU`, `GetTranslation`, `ITEM_RADIO`, `Menu`, `MenuItem`, `PlatformInfo`, `PostEvent` | `bitmap_loader.BitmapLoader`, `GE`, `MainFrame`, `frame.getActiveFit` | 高 · 逐上下文解析影响者、弹药与舰船状态，子菜单编辑技能。 |
| `targetProfile/__init__.py` | 入口 | — | — | 低 · 子包入口。 |
| `targetProfile/adder.py` | MainFrame / 图表状态 | `EVT_MENU`, `GetTranslation`, `Menu`, `MenuItem`, `PlatformInfo` | `MainFrame`, `utils.sorter.smartSort`, `callingWindow.addProfile` | 中 · 根项依图表上下文出现，叶节点读目标配置树并调用视图。 |
| `targetProfile/editor.py` | MainFrame / 图表状态 | `GetTranslation` | `MainFrame`, `targetProfileEditor.TargetProfileEditor` | 中 · 图表上非内置目标方可编辑，动作打开独立编辑器。 |
| `targetProfile/switcher.py` | MainFrame / Fit 单例 | `EVT_MENU`, `GetTranslation`, `ITEM_CHECK`, `Menu`, `MenuItem`, `PlatformInfo`, `PostEvent` | `GE`, `MainFrame`, `utils.sorter.smartSort`, `frame.getActiveFit` | 中 · 火力面板和活动装配决定出现，子菜单读取目标配置树及勾选。 |
### D · `gui/fitCommands`

共 168 文件。59 个计算命令、83 个 GUI 命令、25 个包入口和 1 个 helper。计算命令每个都读 Fit 服务，直接 wx 依赖只有 `wx.Command`。没有原版 GUI 调用。GUI 命令每个都使用 `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` 和 `eos.db.commit`。工作量也包括 slot/key 映射、变更校验、`Do/Undo`、与 FitDoc 的事务及持久化转换。计算路径的服务/事务复杂度独立于 wx 耦合。

| 文件 | 耦合 | wx / GUI 边界 | 难度与理由 |
| --- | --- | --- | --- |
| `__init__.py` | 入口 | 传递载入桌面命令和事件 | 高 · 顶层聚合导入整个桌面命令集，绕过入口即可按功能采用。 |
| `calc/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/booster/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/booster/add.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 添加条目。Do/Undo 读写 Fit。 |
| `calc/booster/remove.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 移除条目。Do/Undo 读写 Fit。 |
| `calc/booster/sideEffectToggleState.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 切换增效剂副作用。Do/Undo 读写 Fit。 |
| `calc/booster/toggleStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 批量切换状态。Do/Undo 读写 Fit。 |
| `calc/cargo/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/cargo/add.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 添加条目。Do/Undo 读写 Fit。 |
| `calc/cargo/changeAmount.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 修改数量。Do/Undo 读写 Fit。 |
| `calc/cargo/remove.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 移除条目。Do/Undo 读写 Fit。 |
| `calc/commandFit/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/commandFit/add.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 添加条目。Do/Undo 读写 Fit。 |
| `calc/commandFit/remove.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 移除条目。Do/Undo 读写 Fit。 |
| `calc/commandFit/toggleStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 批量切换状态。Do/Undo 读写 Fit。 |
| `calc/commandLink/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/commandLink/add.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 添加条目。Do/Undo 读写 Fit。 |
| `calc/commandLink/remove.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 移除条目。Do/Undo 读写 Fit。 |
| `calc/commandLink/toggleStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 批量切换状态。Do/Undo 读写 Fit。 |
| `calc/drone/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/drone/localAdd.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 添加本地物品。Do/Undo 读写 Fit。 |
| `calc/drone/localChangeAmount.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 修改本地堆叠数。Do/Undo 读写 Fit。 |
| `calc/drone/localChangeMutation.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改本地物品变异。还原旧物品或变异快照。 |
| `calc/drone/localRemove.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 移除本地物品。Do/Undo 读写 Fit。 |
| `calc/drone/localToggleStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 切换本地状态。Do/Undo 读写 Fit。 |
| `calc/drone/projectedAdd.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 加入投射物品。还原投射属性或引用。 |
| `calc/drone/projectedChangeAmount.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改投射数量。还原投射属性或引用。 |
| `calc/drone/projectedChangeProjectionRange.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改投射距离。还原投射属性或引用。 |
| `calc/drone/projectedChangeState.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改投射状态。还原投射属性或引用。 |
| `calc/drone/projectedRemove.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 移除投射条目。还原投射属性或引用。 |
| `calc/fighter/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/fighter/abilityToggleStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 批量切换舰载机技能状态。Do/Undo 读写 Fit。 |
| `calc/fighter/changeAmount.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 修改数量。Do/Undo 读写 Fit。 |
| `calc/fighter/localAdd.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 添加本地物品。Do/Undo 读写 Fit。 |
| `calc/fighter/localRemove.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 移除本地物品。Do/Undo 读写 Fit。 |
| `calc/fighter/localToggleStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 切换本地状态。Do/Undo 读写 Fit。 |
| `calc/fighter/projectedAdd.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 加入投射物品。还原投射属性或引用。 |
| `calc/fighter/projectedChangeProjectionRange.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改投射距离。还原投射属性或引用。 |
| `calc/fighter/projectedChangeState.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改投射状态。还原投射属性或引用。 |
| `calc/fighter/projectedRemove.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 移除投射条目。还原投射属性或引用。 |
| `calc/fitPilotSecurity.py` | Fit 服务 / 就地修改 | `wx.Command` | 低 · 修改驾驶员安全等级。Do/Undo 读写 Fit。 |
| `calc/fitRename.py` | Fit 服务 / 就地修改 | `wx.Command` | 低 · 重命名装配。Do/Undo 读写 Fit。 |
| `calc/fitSystemSecurity.py` | Fit 服务 / 就地修改 | `wx.Command` | 低 · 修改建筑所在星系的安全等级。Do/Undo 读写 Fit。 |
| `calc/implant/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/implant/add.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 添加条目。Do/Undo 读写 Fit。 |
| `calc/implant/changeLocation.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 切换植入体来源。Do/Undo 读写 Fit。 |
| `calc/implant/remove.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 移除条目。Do/Undo 读写 Fit。 |
| `calc/implant/toggleStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 批量切换状态。Do/Undo 读写 Fit。 |
| `calc/itemRebase.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 更换条目基础类型。还原旧物品或变异快照。 |
| `calc/module/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/module/changeCharges.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 修改弹药。重算、校验状态。 |
| `calc/module/changeSpool.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 修改预热。Do/Undo 读写 Fit。 |
| `calc/module/localAdd.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 添加本地物品。flush、重算、校验状态。 |
| `calc/module/localChangeMutation.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改本地物品变异。还原旧物品或变异快照。 |
| `calc/module/localChangeStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 批量切换本地状态。重算、校验状态。 |
| `calc/module/localClone.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 复制本地模块。flush、重算、校验状态。 |
| `calc/module/localRemove.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 移除本地物品。flush、重算、校验状态。 |
| `calc/module/localReplace.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 替换本地模块。flush、重算、校验状态。 |
| `calc/module/localSwap.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 交换槽位。Do/Undo 读写 Fit。 |
| `calc/module/projectedAdd.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 加入投射物品。flush、重算、校验状态。 |
| `calc/module/projectedChangeProjectionRange.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改投射距离。重算、校验状态。 |
| `calc/module/projectedChangeStates.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 批量修改投射状态。重算、校验状态。 |
| `calc/module/projectedRemove.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 移除投射条目。flush、重算、校验状态。 |
| `calc/projectedFit/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `calc/projectedFit/add.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 添加条目。重算、校验状态。 |
| `calc/projectedFit/changeAmount.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改数量。还原投射属性或引用。 |
| `calc/projectedFit/changeProjectionRange.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改投射距离。重算、校验状态。 |
| `calc/projectedFit/changeState.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 修改状态。重算、校验状态。 |
| `calc/projectedFit/remove.py` | Fit 服务 / 就地修改 | `wx.Command` | 高 · 移除条目。重算、校验状态。 |
| `calc/shipModeChange.py` | Fit 服务 / 就地修改 | `wx.Command` | 中 · 切换战术模式。Do/Undo 读写 Fit。 |
| `gui/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/booster/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/booster/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddBoosterCommand`，提交后通知 `FitChanged`。 |
| `gui/booster/changeMeta.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 替换同类条目。调用 `CalcAddBoosterCommand`，提交后通知 `FitChanged / ItemChangedInplace`。 |
| `gui/booster/imprt.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量导入。调用 `CalcAddBoosterCommand`，提交后通知 `FitChanged`。 |
| `gui/booster/remove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除条目。调用 `CalcRemoveBoosterCommand`，提交后通知 `FitChanged`。 |
| `gui/booster/sideEffectToggleState.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 切换增效剂副作用。调用 `CalcToggleBoosterSideEffectStateCommand`，提交后通知 `FitChanged`。 |
| `gui/booster/toggleStates.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量切换状态。调用 `CalcToggleBoosterStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/cargo/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/cargo/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddCargoCommand`，提交后通知 `FitChanged`。 |
| `gui/cargo/changeAmount.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改数量。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/cargo/changeMetas.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量替换同类条目。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/cargo/imprt.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量导入。调用 `CalcAddCargoCommand`，提交后通知 `FitChanged`。 |
| `gui/cargo/remove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除条目。调用 `CalcRemoveCargoCommand`，提交后通知 `FitChanged`。 |
| `gui/commandFit/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/commandFit/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddCommandCommand`，提交后通知 `FitChanged`。 |
| `gui/commandFit/remove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除条目。调用 `CalcRemoveCommandFitCommand`，提交后通知 `FitChanged`。 |
| `gui/commandFit/toggleStates.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量切换状态。调用 `CalcToggleCommandFitStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/commandLink/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/commandLink/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddCommandLinkCommand`，提交后通知 `FitChanged`。 |
| `gui/commandLink/remove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除条目。调用 `CalcRemoveCommandLinkCommand`，提交后通知 `FitChanged`。 |
| `gui/commandLink/toggleStates.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量切换状态。调用 `CalcToggleCommandLinkStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/fitPilotSecurity.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改驾驶员安全等级。调用 `CalcChangeFitPilotSecurityCommand`，提交后通知 `FitChanged`。 |
| `gui/fitRename.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 重命名装配。调用 `CalcFitRenameCommand`，提交后通知 `FitRenamed`。 |
| `gui/fitRestrictionToggle.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 切换装配限制。调用 `CalcRemoveLocalModulesCommand`，提交后通知 `FitChanged`。 |
| `gui/fitSystemSecurity.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改建筑所在星系的安全等级。调用 `CalcChangeFitSystemSecurityCommand`，提交后通知 `FitChanged`。 |
| `gui/implant/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/implant/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/implant/changeLocation.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 切换植入体来源。调用 `CalcChangeImplantLocationCommand`，提交后通知 `FitChanged`。 |
| `gui/implant/changeMeta.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 替换同类条目。调用 `CalcAddImplantCommand`，提交后通知 `FitChanged / ItemChangedInplace`。 |
| `gui/implant/imprt.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量导入。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/implant/remove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除条目。调用 `CalcRemoveImplantCommand`，提交后通知 `FitChanged`。 |
| `gui/implant/setAdd.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 加装植入体套装。调用 `CalcAddImplantCommand`，提交后通知 `FitChanged`。 |
| `gui/implant/toggleStates.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量切换状态。调用 `CalcToggleImplantStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/itemsRebase.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量更换条目基础类型。调用 4 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localDrone/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/localDrone/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddLocalDroneCommand`，提交后通知 `FitChanged`。 |
| `gui/localDrone/changeAmount.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改数量。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localDrone/changeMetas.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量替换同类条目。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localDrone/changeMutation.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改变异属性。调用 `CalcChangeLocalDroneMutationCommand`，提交后通知 `FitChanged`。 |
| `gui/localDrone/clone.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 复制条目。调用 `CalcAddLocalDroneCommand`，提交后通知 `FitChanged`。 |
| `gui/localDrone/imprt.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量导入。调用 `CalcAddLocalDroneCommand`，提交后通知 `FitChanged`。 |
| `gui/localDrone/mutatedConvert.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 转换为变异类型。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localDrone/mutatedImport.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 导入变异数据。调用 `CalcAddLocalDroneCommand`，提交后通知 `FitChanged`。 |
| `gui/localDrone/mutatedRevert.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 还原变异条目。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localDrone/remove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除条目。调用 `CalcRemoveLocalDroneCommand`，提交后通知 `FitChanged`。 |
| `gui/localDrone/stackSplit.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 拆分无人机堆叠。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localDrone/stacksMerge.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 合并无人机堆叠。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localDrone/toggleStates.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量切换状态。调用 `CalcToggleLocalDroneStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/localFighter/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/localFighter/abilityToggleState.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 切换舰载机技能状态。调用 `CalcToggleFighterAbilityStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/localFighter/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddLocalFighterCommand`，提交后通知 `FitChanged`。 |
| `gui/localFighter/changeAmount.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改数量。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localFighter/changeMetas.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量替换同类条目。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localFighter/imprt.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量导入。调用 `CalcAddLocalFighterCommand`，提交后通知 `FitChanged`。 |
| `gui/localFighter/remove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除条目。调用 `CalcRemoveLocalFighterCommand`，提交后通知 `FitChanged`。 |
| `gui/localFighter/toggleStates.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量切换状态。调用 `CalcToggleLocalFighterStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/localModule/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/changeCharges.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改弹药。调用 `CalcChangeModuleChargesCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/changeMetas.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量替换同类条目。调用 `CalcReplaceLocalModuleCommand`，提交后通知 `FitChanged / ItemChangedInplace`。 |
| `gui/localModule/changeMutation.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改变异属性。调用 `CalcChangeLocalModuleMutationCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/changeSpool.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改预热。调用 `CalcChangeModuleSpoolCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/changeStates.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量修改状态。调用 `CalcChangeLocalModuleStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/clone.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 复制条目。调用 `CalcCloneLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/fillAdd.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 以新品填充空槽。调用 `CalcAddLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/fillClone.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 以现有物品的副本填充空槽。调用 `CalcAddLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/mutatedConvert.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 转换为变异类型。调用 `CalcReplaceLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/mutatedImport.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 导入变异数据。调用 `CalcAddLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/mutatedRevert.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 还原变异条目。调用 `CalcReplaceLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/remove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除条目。调用 `CalcRemoveLocalModulesCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/replace.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 替换模块。调用 `CalcReplaceLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModule/swap.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 交换槽位。调用 `CalcSwapLocalModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/localModuleCargo/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/localModuleCargo/cargoToLocalModule.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 货柜物品移入模块槽。调用 4 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/localModuleCargo/localModuleToCargo.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 卸载模块进货柜。调用 4 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedChangeProjectionRange.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改投射距离。调用 4 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedChangeStates.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量修改投射状态。调用 4 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedDrone/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/projectedDrone/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddProjectedDroneCommand`，提交后通知 `FitChanged`。 |
| `gui/projectedDrone/changeAmount.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改数量。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedDrone/changeMetas.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量替换同类条目。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedFighter/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/projectedFighter/abilityToggleState.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 切换舰载机技能状态。调用 `CalcToggleFighterAbilityStatesCommand`，提交后通知 `FitChanged`。 |
| `gui/projectedFighter/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddProjectedFighterCommand`，提交后通知 `FitChanged`。 |
| `gui/projectedFighter/changeAmount.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改数量。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedFighter/changeMetas.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量替换同类条目。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedFit/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/projectedFit/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddProjectedFitCommand`，提交后通知 `FitChanged`。 |
| `gui/projectedFit/changeAmount.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改数量。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedModule/__init__.py` | 入口 | — | 低 · 空包，无规则或界面导入。 |
| `gui/projectedModule/add.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 添加条目。调用 `CalcAddProjectedModuleCommand`，提交后通知 `FitChanged`。 |
| `gui/projectedModule/changeCharges.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改弹药。调用 `CalcChangeModuleChargesCommand`，提交后通知 `FitChanged`。 |
| `gui/projectedModule/changeMetas.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 批量替换同类条目。调用 2 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/projectedModule/changeSpool.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 修改预热。调用 `CalcChangeModuleSpoolCommand`，提交后通知 `FitChanged`。 |
| `gui/projectedRemove.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 移除投射条目。调用 4 种 Calc 命令，提交后通知 `FitChanged`。 |
| `gui/shipModeChange.py` | MainFrame / 事务与事件 | `wx.Command`、`wx.PostEvent`、`MainFrame`、`GE` | 高 · 切换战术模式。调用 `CalcChangeShipModeCommand`，提交后通知 `FitChanged`。 |
| `helpers.py` | 数据规则 / 命令状态 | `wx.CommandProcessor` | 中 · 相似物品、快照与限制 helper 可直接调用。InternalCommandHistory 的批量 Do/Undo 依赖 wx 历史。 |

[c01]: https://github.com/pyfa-org/Pyfa/commit/34a39e97
[c02]: https://github.com/pyfa-org/Pyfa/commit/efb558a5
[c03]: https://github.com/pyfa-org/Pyfa/commit/49fcf5b7
[c04]: https://github.com/pyfa-org/Pyfa/commit/f12b9c65
[c05]: https://github.com/pyfa-org/Pyfa/commit/b6855e9f
[c06]: https://github.com/pyfa-org/Pyfa/commit/7e4b29a4
[c07]: https://github.com/pyfa-org/Pyfa/commit/2b5bdcaa
[c08]: https://github.com/pyfa-org/Pyfa/commit/4fcfa68d
[c09]: https://github.com/pyfa-org/Pyfa/commit/891e7082
[c10]: https://github.com/pyfa-org/Pyfa/commit/c5487b1d
[c11]: https://github.com/pyfa-org/Pyfa/commit/e5e08fc1
[c12]: https://github.com/pyfa-org/Pyfa/commit/11ac35c5
[c13]: https://github.com/pyfa-org/Pyfa/commit/fd4c4eb2
[c14]: https://github.com/pyfa-org/Pyfa/commit/8069c0af
[c15]: https://github.com/pyfa-org/Pyfa/commit/5a49d286
[c16]: https://github.com/pyfa-org/Pyfa/commit/69340b80
[c17]: https://github.com/pyfa-org/Pyfa/commit/872e152f
[c18]: https://github.com/pyfa-org/Pyfa/commit/cd1cabcf
[c19]: https://github.com/pyfa-org/Pyfa/commit/56410209
[c20]: https://github.com/pyfa-org/Pyfa/commit/05fb350d
[c21]: https://github.com/pyfa-org/Pyfa/commit/82f9ef33
[c22]: https://github.com/pyfa-org/Pyfa/commit/c7074f49
[c23]: https://github.com/pyfa-org/Pyfa/commit/23e09729
[c24]: https://github.com/pyfa-org/Pyfa/commit/6472cabc
[c25]: https://github.com/pyfa-org/Pyfa/commit/f01949d8
[c26]: https://github.com/pyfa-org/Pyfa/commit/dbb61a8a
[c27]: https://github.com/pyfa-org/Pyfa/commit/b12adcae
[c28]: https://github.com/pyfa-org/Pyfa/commit/72567a71
[c29]: https://github.com/pyfa-org/Pyfa/commit/ae8405d1
[c30]: https://github.com/pyfa-org/Pyfa/commit/0e6b9b48
[c31]: https://github.com/pyfa-org/Pyfa/commit/a00a80b4
[c32]: https://github.com/pyfa-org/Pyfa/commit/e0e1c1ce
[c33]: https://github.com/pyfa-org/Pyfa/commit/b1f048ac
[c34]: https://github.com/pyfa-org/Pyfa/commit/80ced86a
[c35]: https://github.com/pyfa-org/Pyfa/commit/de93777f
[c36]: https://github.com/pyfa-org/Pyfa/commit/e79f9796
[c37]: https://github.com/pyfa-org/Pyfa/commit/6e4ca641
[c38]: https://github.com/pyfa-org/Pyfa/commit/46c6381c
[c39]: https://github.com/pyfa-org/Pyfa/commit/7c67f18b
[c40]: https://github.com/pyfa-org/Pyfa/commit/9ab7e0db
[c41]: https://github.com/pyfa-org/Pyfa/commit/7e92b58c
