# 产品说明

## 定位

有道云笔记导出是一个 Chrome 扩展，用于一键批量将有道云笔记导出为 Markdown。

该产品面向希望在不使用命令行工具的情况下，完成本地备份、内容迁移或长期归档的用户。

## 目标用户

- 正在迁移到 Obsidian 等 Markdown 工具的有道云笔记用户。
- 希望保留本地备份的学生和职场用户。
- 拥有大量笔记本、需要可视化批量导出流程的长期用户。
- 关注本地资源和文件夹结构的技术用户。

## 核心流程

1. 用户在浏览器中登录 `note.youdao.com`。
2. 扩展通过 Chrome Cookie 读取浏览器登录状态。
3. 弹窗加载笔记本树。
4. 用户选择要导出的笔记本或文件夹。
5. 后台任务下载笔记数据、转换格式、本地化资源并构建 ZIP。
6. 浏览器下载生成的 ZIP 文件。

关闭弹窗不会停止导出任务。

## 当前范围

- 基于浏览器 Cookie 的认证。
- 加载笔记本树。
- 按笔记本或文件夹选择。
- Markdown 导出。
- 为 Markdown 依赖资源生成同级 `assets/` 文件夹。
- ZIP 打包。
- 后台执行，并可恢复进度显示。
- 中文和英文界面。
- 带每日悬停限制的赞助弹窗。

## 支持的输出

最终导出结果刻意只包含：

- Markdown 文件（`.md`）
- 同级 `assets/` 文件夹中的 Markdown 依赖资源

最终 ZIP 中不会保留原始 `.drawio`、`.mindmap`、`.lxtable` 和 `.excalidraw` 文件。

## 格式处理

| 来源 | 输出 |
| --- | --- |
| 标准笔记 | Markdown |
| Markdown 笔记 | Markdown，并本地化资源 |
| 图片文件 | Markdown 包装文件，并将图片保存到 `assets/` |
| 表格（`.lxtable`） | Markdown 表格 |
| 思维导图（`.mindmap`） | Markdown 大纲 |
| Draw.io（`.drawio`） | Markdown，并嵌入链接的 SVG |
| Excalidraw（`.excalidraw`） | Markdown，并嵌入链接的 SVG |

## 成功标准

- 用户无需手动复制 Cookie 即可完成导出。
- 导出的 ZIP 保留笔记本层级。
- Markdown 文件使用本地相对资源链接。
- 关闭弹窗不会中断后台导出。
- 单条笔记失败会被记录，但不会阻塞整个导出流程。
