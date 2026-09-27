# MiroFish 前端体验页

公开地址（合并到 `main` 并由 GitHub Pages 发布后）：https://upstardata.github.io/agri-llm-demo/mirofish/

本目录保存 [MiroFish 官方仓库](https://github.com/666ghj/MiroFish) 提交 `117ed37758cdc96f73b7d5e0d22713c50439695f` 的前端、`locales/`、中文 README 和 AGPL-3.0 许可。`../mirofish/` 是据此构建的静态文件。

相对官方源码，本体验页仅调整了：

- Vite 构建路径为 GitHub Pages 的 `/agri-llm-demo/mirofish/`，构建结果写到 `../mirofish/`。
- 路由改用 hash 模式，以便静态托管下刷新子页面。
- 页面常驻提示，说明这是无后端体验页；API 请求在浏览器端被阻止，不会向访问者的 `localhost` 或其他服务发送文件和需求。

在仓库根目录重建：

```sh
cd mirofish-source/frontend
npm ci
npm run build
```

本页可以浏览前端界面。上传文件和填写需求后，页面可进入构建步骤，但不能生成图谱或执行推演；这些功能需要独立运行官方 Python 后端及相应配置。请勿把此页用于真实业务数据。
