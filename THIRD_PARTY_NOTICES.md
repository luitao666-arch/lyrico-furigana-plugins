# 第三方声明

本项目使用或衍生自下列第三方内容。各自的版权与许可证归原作者所有。

## 1. 汉字读音表 —— KANJIDIC

- 文件：`japanese-lyrics-furigana/lib/03_kanji_readings.js`
- 数据来源：KANJIDIC，© Electronic Dictionary Research and Development Group（EDRDG），<https://www.edrdg.org/>
- 经 [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data)（MIT License）整理后使用
- 许可证：[Creative Commons Attribution-ShareAlike 4.0 International（CC BY-SA 4.0）](https://creativecommons.org/licenses/by-sa/4.0/)；EDRDG 许可说明见 <https://www.edrdg.org/edrdg/licence.html>
- 修改说明：仅保留常用汉字与人名用汉字；片假名读音转为平假名；去除送假名与连字符标记。生成脚本为 `tools/build-kanji-readings.py`
- ShareAlike：上述读音表文件是 KANJIDIC 的改编，同样以 CC BY-SA 4.0 授权。若再分发其改编版本，须保留署名、注明修改，并使用相同或兼容的许可证

> This package uses the KANJIDIC dictionary file. This file is the property of the Electronic Dictionary Research and Development Group, and is used in conformance with the Group's licence.

## 2. 官方插件 —— Replica0110/Lyrico-Plugins

- 来源：<https://github.com/Replica0110/Lyrico-Plugins>（`netease`、`kugou` 0.4.1）
- 衍生文件：`japanese-lyrics-furigana/source.js`（Furigana 接入之外的部分）、`lib/01_http_sign.js`、`lib/02_krc.js`（酷狗）、`lib/05_ne_http.js`、`lib/06_ne_lrc.js`（网易云）、`manifest.json`、`locales/*.json`
- **许可证状态：该仓库未声明许可证**（仓库中没有 LICENSE 文件，GitHub 也未识别到许可证）。在原作者明确授权之前，这些衍生内容的权利归原作者所有。
- 本项目对这些文件只做最小改动（接入 Furigana、修改插件 ID / 名称 / 版本），并保留 `manifest.json` 中的原作者署名 `Replica0110`。
- 如原作者要求移除或调整，请通过 Issue 联系，将及时处理。

## 3. Lyrico

- 来源：<https://github.com/Replica0110/Lyrico>，Apache License 2.0
- 本仓库**不包含** Lyrico 的代码。插件通过 Lyrico 公开的插件 API（API Version 5）运行。

## 4. 开发与测试工具（不随插件分发）

- 官方插件开发包 `plugin-devkit`（Lyrico-Plugins，`package.json` 声明为 Apache-2.0），用于校验和打包。
- [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)（MIT），用于 QuickJS 兼容性测试。
