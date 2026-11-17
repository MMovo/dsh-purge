<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">⚔️ dsh-purge 合版 2.0.0-rc3（中文文档）</h1>

> **中文完整文档在 [`README.md`](README.md)。** 本文件保留仅为兼容旧链接与插件自更新时复制的文件清单。
>
> [README.md](README.md) 内含：
>
> - 这版比上游 1.1.71 多了什么（88 条补丁、14 条权限账簿、64 个红队工具、三个模式）
> - 环境要求（dsh **0.2.2-rc.3** / Node ≥ 18）
> - 三种安装方式：插件面板添加本地目录、`dsh plugin add <目录>`、手工 `link:` + `pnpm install`
> - 安装后必做的三步（完全退出宿主 → 清洗 → 应用 → 重启）
> - 安装验证清单、目录结构、运行时文件、配置项与权限账簿开关
> - 更新 / 还原 / 卸载、8 条 FAQ、兼容性表、声明与署名
>
> 英文文档：[`README.en.md`](README.en.md)（内容仍对应上游 1.1.71，待更新）。更细的改动账：[`MERGED.md`](MERGED.md)、[`ADAPTATION.md`](ADAPTATION.md)。原版 README（原作者版本，已归档）：[`docs/upstream/`](docs/upstream/)。

```powershell
# 最短路径（本机已是 link: 安装，改完源码重启宿主即可）
dsh plugin --profile desktop add "C:\Users\Administrator\Documents\deepseek-harness\1\dsh-purge-1.1.71 new"
# 重启宿主 → 右侧栏「清洗」→「应用」
```
