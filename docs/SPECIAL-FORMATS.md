# 特殊格式说明

日期：2026-05-08

## 已测试格式

已使用真实有道 API 响应测试以下格式：

| 格式 | 响应形态 | 导出结果 |
| --- | --- | --- |
| `.excalidraw` | JSON 元素 | Markdown + 链接的 SVG 资源 |
| `.lxtable` | JSON 表格和单元格 | Markdown 表格 |
| `.drawio` | SVG data URL | Markdown + 链接的 SVG 资源 |
| `.mindmap` | JSON 节点 | Markdown 大纲 |

## 当前最终 ZIP 策略

最终导出结果只保留 Markdown 文件和 Markdown 依赖资源：

```text
Folder/
  Note.md
  Board.md
  Mindmap.md
  assets/
    Note_001.png
    Board.svg
```

原始 `.drawio`、`.mindmap`、`.lxtable` 和 `.excalidraw` 文件不会被保留。

## 重要发现

- 标准同步下载端点可以返回已测试特殊文件的可用数据。
- `.lxtable` 的值可能存储在 `cell["0"]` 等数字单元格字段中。
- `.drawio` 可能以 `data:image/svg+xml;base64,...` 形式返回，需要先解码。
- `.mindmap` 节点数组可以转换为 Markdown 大纲。
- Draw.io 和 Excalidraw 输出使用从 Markdown 链接的外部 SVG 资源，而不是内联 SVG。
