# 有道云笔记导出

有道云笔记导出是一个 Chrome 扩展，用于将有道云笔记导出为本地 Markdown 备份。

它会读取浏览器中 `note.youdao.com` 的现有登录状态，加载笔记本树，在本地转换支持的笔记格式，下载引用的资源，并将结果打包为 ZIP 文件。

## 功能特性

- 批量导出选中的笔记本和文件夹。
- 将笔记导出为 Markdown。
- 保留原始笔记本文件夹结构。
- 将所有引用资源保存到同级 `assets/` 文件夹。
- 转换有道云笔记特殊格式：
  - 表格（`.lxtable`）转为 Markdown 表格
  - 思维导图（`.mindmap`）转为 Markdown 大纲
  - Draw.io 和 Excalidraw 白板转为 Markdown，并链接本地 SVG 资源
  - 图片文件转为 Markdown 包装文件，并链接本地图片资源
- 弹窗关闭后仍可在后台继续导出。
- 将所有内容打包为一个 ZIP 文件下载。
- 支持中文和英文界面。

## 隐私

所有转换和打包都在浏览器扩展本地完成。扩展不会将笔记内容上传到任何第三方服务。

认证使用浏览器中有道云笔记的 Cookie。扩展需要 `cookies`、`storage`、`downloads` 以及有道相关主机权限，用于读取已登录会话、保存导出进度和下载生成的 ZIP 文件。

## 开发安装

```bash
npm install
npm run build
```

然后在 Chrome 中加载 `dist/` 目录：

1. 打开 `chrome://extensions`。
2. 启用“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `dist/` 目录。

## 构建 ZIP

```bash
npm run build
npm run zip
```

生成的安装包位于：

```text
build/youdaonote-export.zip
```

## 项目结构

```text
src/
  background.js        扩展 Service Worker
  popup.*              弹窗界面
  settings.*           选项页
  core/                有道 API、转换器、导出器、ZIP 构建器
_locales/              Chrome i18n 文案
assets/                界面资源
icons/                 扩展图标
docs/                  产品、技术、API 和商店文档
```

## 文档

- [产品说明](docs/PRODUCT.md)
- [技术设计](docs/TECH-DESIGN.md)
- [有道 API 记录](docs/YOUDAO-API-RESEARCH.md)
- [Chrome 应用商店描述](docs/WEBSTORE-DESCRIPTION.md)

## 免责声明

本项目为独立项目，与有道云笔记或网易无隶属关系。请仅用于导出你有权访问的内容。
