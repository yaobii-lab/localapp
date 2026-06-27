<div align="center">

# localapp

### 一行命令，打开你做过的任何本机网页工具。

*你 vibe 出来的小工具、所有的 dev server、agent 顺手写的脚本——都被记住，都能被再次打开。Mac 上的"启动台"，给你的本机 artifact 用。*

[![npm version](https://img.shields.io/npm/v/%40yaobii%2Flocalapp?color=cb3837&logo=npm)](https://www.npmjs.com/package/@yaobii/localapp)
[![node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![platform](https://img.shields.io/badge/platform-macOS-000000?logo=apple)](#快速开始)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/yaobii-lab/localapp/issues)

[English](./README.md) · **简体中文**

</div>

![LocalApp 列出本机网页工具，并按名字重新打开其中一个](./assets/readme/terminal-demo.gif)

## 快速开始

```bash
npm install -g @yaobii/localapp
# 或者无需安装直接运行：
npx @yaobii/localapp ls
```

需要 **macOS** 和 **Node 20+**。

## 你为什么需要它

- ↩️ **一行命令打开任何本机网页工具。** LocalApp 记住启动命令和目录；几周后运行 `localapp run notes-export`，工具就会回来。
- 🤖 **自动接入 coding agent。** `localapp setup` 会让 Claude Code 和 Codex 先查 LocalApp、通过它启动服务，并复用健康实例。
- 🤝 **让多个 agent 接力同一个服务。** 每个 agent 都能看到同一个项目、端口、URL，以及服务是否还活着，不再各开一份。
- 🧭 **换了 agent，localhost 仍然看得懂。** LocalApp 给实时系统数据补上项目含义，但脚本和环境仍由你掌控。

## 问题所在

你某个周日 vibe 了一个本机小工具——一个比价器、一个 CSV 标注页、一个一次性的报名表。artifact 跑起来了，在 `localhost:3000`。一周后你想再用一次。它住在哪个文件夹？要敲什么命令启动？你已经忘了。

或者你同时开两个 coding agent 干活。到了周五，你的 Mac 上 `5173` / `5174` / `7110` / `8765` 全在监听——没人，包括你和下一个 agent，能说清哪个是真实的、属于哪个项目、哪个可以安全停掉。

这是同一个问题的两个速度：**进程还活着，但它的意义已经蒸发了**——shell 关了，上下文被压缩了，你的脑子也已经走开。`5173` 退化成一个没人敢动的无意义数字；那个周日做的小工具，退化成一个找不到的文件夹。

现在，agent 回答“在跑什么？”要走一遍 `lsof + ps + grep + curl`——多次调用，最终还是猜。localapp 用**一次调用**返回已解析的答案：端口 → 项目 → 来源 → 存活状态，语义已随数据附带。而 `localapp open <名字>` 能把任何被遗忘的工具重新打开。

## 接入 coding agent

安装或更新 LocalApp，并一次确认所有支持的 coding agent：

```bash
npx @yaobii/localapp@latest setup
```

已经安装 LocalApp 时，可直接管理 agent 接入：

```bash
localapp init                              # 检测 Claude Code、Codex 和 Cursor
localapp init --status                     # 查看完整、缺失或冲突状态
localapp init --dry-run                    # 只预览，不写文件
localapp init --agent claude,codex --yes   # 非交互地指定 agent
localapp init --uninstall                  # 只删除 LocalApp 自己的内容
```

`setup` 会先确认安装后的 `localapp` 命令可以运行，再更新 agent 指令。你原有的指令不会被改写；如果你编辑过 LocalApp 生成的规则，它会停下来提醒你处理。

Claude Code 和 Codex 会自动接入。Cursor 需要你在 **Cursor Settings → Rules** 中完成一步设置；LocalApp 检测到 Cursor 时会提醒你。

## 唤回已消失的服务

重启后服务没了？你记不清确切的命令。localapp 记得：

```bash
localapp run 记忆               # 模糊匹配货架上的所有服务
# （等价写法：localapp open 记忆）
#
# 已在运行时直接打印 URL；否则在后台重新执行记录的启动命令和目录
# 并把终端还给你。需要看日志并用 Ctrl-C 停止时，加 --foreground。
# 若项目环境已经失效（Python 虚拟环境、依赖、环境变量），localapp 会明确报错，
# 但不会擅自修复项目环境。
```

## 只加到货架，不跑

你上周末 vibe 出来一个本机小工具，现在不想立刻跑——但两周后你还想再用它一次，那时你已经记不清它放在哪个文件夹了：

```bash
cd ~/projects/notes-app
localapp add --note "会议记录" -- npm run dev
# ✓ added notes-app to shelf
# 再次打开：localapp run notes-app
```

`add` 记下启动命令、目录、分支和备注，但不启动任何进程。下次运行 `localapp ls`，它会出现在“未运行”一组，等你再次打开。

## 启动服务，不堆叠端口

```bash
localapp run --note "checkout redesign" -- npm run dev
# 如果当前项目已有健康服务，直接复用并打印 URL。
# 否则启动服务、识别端口并记录下来。
```

已经有服务在跑，但不是通过 localapp 启动的？直接原地标注，无需重启：

```bash
localapp adopt 8765 --note "patch panel"
```

## 为什么有效

localapp 读取操作系统的真实状态（`lsof`），只在上面**标注**一层 —— 补上内核无法重建的那一块：哪个项目、哪个 agent、为什么跑。这带来一个决定性特性：

> 忽略 localapp 的 agent 不会破坏它。它的服务器只是以未标注端口的形式出现。视图永远不会盲区，也永远不会失效。

agent 使用它的方式，和使用 `rg` 或 `jq` 一样：它是获取所需答案的低成本路径 —— 而不是一条必须记住去遵守的策略。

## 命令

| 命令 | 作用 |
|---|---|
| `localapp ls` | 看货架上的服务。`--all` 显示所有项目、`--running` / `--stopped` / `--status <s>` 过滤、`--json` 供 agent 使用。 |
| `localapp run <名字>` | 把已注册的服务从货架上取下来跑起来。已经活着？直接打印 URL。和 `localapp open <名字>` 等价。 |
| `localapp run --note "…" -- <cmd>` | 启动（或复用）一个新的开发服务，自动加到货架。 |
| `localapp add --note "…" -- <cmd>` | 只加到货架、不跑——给那些以后想再用的小工具留个位。 |
| `localapp adopt <port> --note "…"` | 对已经在跑的端口原地标注，不重启。 |
| `localapp status <port>` | 解释一个端口的监听进程、LocalApp 记录和下一步动作。agent 用 `--json`。 |
| `localapp init [选项]` | 接入 coding agent；可查看状态、预览改动、指定 agent，或删除 LocalApp 指令。 |
| `localapp setup [选项]` | 安装或更新 LocalApp，再接入检测到的 agent。 |

运行 `localapp <command> --help` 查看每个命令的详细选项。

## 它不是什么

- **不是部署平台。** 它不会动 `package.json`、框架配置、Dockerfiles，也不碰 Vercel/Railway/Netlify 的任何设置。
- **不是 AI 应用构建器。**
- **不是守护进程或进程管理器。** 它按需读取实时运行状态，不向外发送任何数据。读取比拦截侵入性更低。

## 社区

LocalApp 认可并支持 [LINUX DO](https://linux.do) 社区。

## 许可证

[MIT](./LICENSE) © YBloom
