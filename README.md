# pyfa 手机网页版

在手机浏览器里运行 [pyfa](https://github.com/pyfa-org/Pyfa) 原版计算引擎（eos，经 Pyodide），模拟 EVE Online 舰船装配。

- 非官方，与 CCP hf. 无关联。EVE Online 及相关名称、图像归 CCP hf. 所有。
- 基于 pyfa，以 GPLv3 发布（见 LICENSE）。pyfa 源码在 `vendor/pyfa` 子模块中，未做修改。

```bash
git submodule update --init --depth 1
pnpm install
pnpm dev
./check-all.sh
```

设计规则见 `DESIGN.md`。
