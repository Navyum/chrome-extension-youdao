# 有道 API 记录

本文档记录扩展使用的 API。这些内容基于浏览器流量和扩展测试整理，不是公开官方 API 文档。

## 认证

有道云笔记使用浏览器 Cookie。重要 Cookie 包括：

| Cookie | 用途 |
| --- | --- |
| `YNOTE_CSTK` | CSRF token |
| `YNOTE_LOGIN` | 登录标记 |
| `YNOTE_SESS` / `NTES_YD_SESS` | 会话凭证 |
| `YNOTE_PERS`、`P_INFO`、`S_INFO` | 账号或资料提示信息 |

扩展通过 `chrome.cookies` 读取 Cookie，并在后台 Service Worker 中携带浏览器凭证发送 API 请求。

部分请求要求在 query 或 body 参数中同时携带 `cstk`。扩展会从 `YNOTE_CSTK` 中提取该值。

## 主机访问

manifest 授予了较宽的有道主机权限，用于覆盖 Cookie 和资源 URL 的不同变体：

```json
[
  "https://youdao.com/*",
  "https://*.youdao.com/*",
  "http://youdao.com/*",
  "http://*.youdao.com/*"
]
```

## 目录 API

### 根目录

```text
POST https://note.youdao.com/yws/api/personal/file?method=getByPath&keyfrom=web&cstk=...
form: path=/
```

### 目录列表

```text
GET https://note.youdao.com/yws/api/personal/file/{dirId}
  ?all=true
  &f=true
  &len=200
  &sort=1
  &isReverse=false
  &method=listPageByParentId
  &keyfrom=web
  &cstk=...
```

响应中包含 `fileEntry` 条目。目录的 `dir` 为 `true`；笔记或文件的 `dir` 为 `false`。

## 笔记下载 API

扩展通过以下接口下载笔记内容：

```text
POST https://note.youdao.com/yws/api/personal/sync?method=download&keyfrom=web&cstk=...
form:
  fileId={fileId}
  version=-1
  convert=true
  editorVersion={timestamp}
  editorType=1
  cstk={cstk}
```

浏览器 Web 应用可能会包含额外的埋点参数，例如平台、屏幕尺寸、应用名称和城市字段。测试显示，上述核心同步端点和表单字段已足够扩展使用。

## 资源下载

图片和附件会通过有道资源 URL 获取，例如：

```text
https://note.youdao.com/yws/res/{resourceId}
```

请求必须携带已登录的浏览器会话。

## 头像 API

用户头像可以携带 Cookie 获取：

```text
https://note.youdao.com/yws/api/image/normal/{timestamp}?userId={userId}
```

扩展在后台获取头像；如果不可用，则回退到本地生成的头像。

## 格式观察

| 格式 | 观察到的响应 |
| --- | --- |
| `.note` 旧编辑器 | 类 XML 内容 |
| 新编辑器 | JSON 或数字键 JSON |
| `.md` | Markdown 文本 |
| `.lxtable` | JSON 表格和单元格结构 |
| `.mindmap` | JSON 节点结构 |
| `.drawio` | SVG 或 SVG data URL |
| `.excalidraw` | JSON 元素 |

## 限流

目前没有公开的限流说明。扩展使用请求限流、有限并发和重试机制，避免对服务造成压力，也减少临时响应失败导致的导出中断。
