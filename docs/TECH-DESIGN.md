# 技术设计

## 架构

```text
弹窗界面
  -> chrome.runtime.sendMessage
后台 Service Worker
  -> 有道 API
  -> 本地转换器
  -> JSZip
  -> chrome.downloads
```

弹窗只作为控制界面。耗时较长的导出工作在后台 Service Worker 中运行，因此关闭弹窗不会中断任务。

## 主要模块

```text
src/background.js              消息处理、认证同步、导出编排
src/popup.*                    弹窗界面、笔记本选择、进度展示
src/settings.*                 选项页和关于页
src/core/constants.js          常量和 i18n 辅助函数
src/core/youdao-api.js         有道 API 请求
src/core/throttle.js           请求限流和重试处理
src/core/converter.js          标准笔记转 Markdown
src/core/special-converter.js  表格、思维导图、Draw.io、Excalidraw 转换
src/core/exporter.js           批量导出流程和资源本地化
src/core/zip-builder.js        ZIP 文件构建器
src/core/state.js              导出状态持久化
```

## 权限

| 权限 | 用途 |
| --- | --- |
| `cookies` | 从浏览器读取有道登录 Cookie |
| `storage` | 持久化导出进度和状态 |
| `downloads` | 下载生成的 ZIP 文件 |
| `https://*.youdao.com/*` | 访问有道 API 和资源 |
| `http://*.youdao.com/*` | 覆盖旧版 Cookie 或资源 URL 变体 |

## 导出状态

导出状态包含：

```js
{
  phase,
  current,
  total,
  currentNote,
  successCount,
  failedCount,
  skippedCount,
  errors
}
```

状态存储在 `chrome.storage.local` 中，因此弹窗重新打开后可以显示最新进度。

## 导出流程

1. 从有道加载笔记本树。
2. 将选中的文件夹 ID 展开为笔记 ID。
3. 通过同步 API 下载每条笔记。
4. 按文件类型分流：
   - 图片文件 -> 将图片写入 `assets/` 并创建 Markdown 包装文件
   - 特殊文件 -> 使用本地特殊格式转换器
   - 标准笔记 -> 使用 Markdown 转换器
5. 下载引用的资源。
6. 将 Markdown 链接重写为相对 `assets/` 路径。
7. 生成 ZIP。
8. 触发浏览器下载。

## 资源布局

每个文件夹层级共享一个 `assets/` 目录，用于保存该层级文件引用的资源。

示例：

```text
Work/
  Meeting.md
  Roadmap.md
  assets/
    Meeting_001.png
    Roadmap_board.svg
```

这种布局能让导出结果更紧凑，并避免为每条笔记生成分散的资源文件夹。

## 特殊格式转换

| 格式 | 策略 |
| --- | --- |
| `.lxtable` | 解析 JSON 表格、单元格数据，并输出 Markdown 表格 |
| `.mindmap` | 解析节点层级，并输出 Markdown 大纲 |
| `.drawio` | 解码 SVG 或 data URL，并从 Markdown 中链接嵌入的 SVG |
| `.excalidraw` | 将支持的元素渲染为 SVG，并从 Markdown 中链接嵌入的 SVG |

## 错误处理

- 401/403：报告认证失败。
- 429：延迟后重试。
- 网络或 API 失败：使用退避策略重试。
- 单条笔记失败：记录错误并继续。
- ZIP 或下载失败：作为导出任务错误展示。

## 国际化

界面文案使用 Chrome i18n：

```text
_locales/zh_CN/messages.json
_locales/en/messages.json
```

静态 HTML 使用 `data-i18n`、`data-i18n-title`、`data-i18n-aria-label` 和 `data-i18n-alt`。动态 JavaScript 文案使用共享的 `i18n()` 辅助函数或弹窗中的 `msg()` 辅助函数。
