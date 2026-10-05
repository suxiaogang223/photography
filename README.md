# 摄影集网站

这是独立摄影集项目的本地实现，网页和展示图片均可由 GitHub Pages 托管。首页按系列编排，系列页保留完整照片比例，索引页提供筛选，照片查看器支持键盘、触屏滑动和实际尺寸查看。无需外部字体、图库服务或运行时服务器。

当前已导入 143 张真实照片：青岛映像 44 张、二道海胶片 43 张、松州古城 26 张、中秋节扫街 30 张。系列按起始拍摄日期从新到旧展示，不改变系列内照片顺序。完整站点约 293.1 MB，使用深色中性界面，保留完整构图，不对照片添加滤镜。原图未复制进仓库。

正式网址：[目光所及摄影集](https://suxiaogang223.github.io/photography/)。源码与展示图位于公开仓库 [suxiaogang223/photography](https://github.com/suxiaogang223/photography)，由 GitHub Actions 构建并部署到 GitHub Pages。

## 本地运行

需要 Node.js 22 或更高版本。进入本项目目录后执行：

```sh
npm ci
npm run dev
```

打开 http://localhost:4173/photography/ 。内容和样式修改会重新构建，浏览器需要手动刷新。`npm run preview` 也会构建并启动预览，但不监视文件变化。`PORT=4174 npm run dev` 可以更换端口。

```sh
npm run check
```

检查命令运行自动化测试并构建到 `dist/`。测试使用临时目录，不修改真实作品清单。`dist/` 是可重建的输出，不应手工编辑或提交。

## 导入真实照片

先从 Apple 照片导出 JPEG 或 PNG 到仓库之外的目录。保留原图备份；本脚本只生成网站展示版本，不复制、不删除、不修改原图，也不自动读取 iCloud。

```sh
npm run import -- --input "/绝对路径/导出的照片" --collection mid-autumn-streets --title "中秋节扫街"
# 新胶片系列在首次导入时标记媒介；已有胶片系列会沿用清单中的 medium
npm run import -- --input "/绝对路径/胶片扫描" --collection new-film-roll --title "胶片系列" --medium film
```

支持 JPEG、PNG、WebP、TIFF 和 AVIF，仅读取指定目录第一层；HEIC、RAW 和视频需要先导出或转换。三个版本的长边分别不超过 640、1600、3000 像素，不放大小图。输出 WebP，自动校正 EXIF 方向并转换为 sRGB，移除 EXIF、XMP 和 IPTC，仅保留标准 sRGB 色彩配置。胶片保留原始横竖构图、不裁切；横幅使用上下齿孔，竖幅使用左右齿孔，不修改原始导出文件。数字照片导入时会从原图 EXIF 提取相机、镜头型号、35mm 等效焦距、光圈、快门、ISO 和原始拍摄时间，单独写入每张照片的 `capture`，供灯箱显示；焦距参数只显示等效值，缺少等效焦距时不回退显示实际焦距。镜头型号保留原名，不会公开 GPS、序列号或完整元数据。文件体积取决于内容，并不保证所有照片达到固定大小。

向已有系列导入时追加照片，重复导入同一文件会跳过，同一批次中的重复文件也会去重。照片用内容摘要命名，不公开原始文件名；相同文件重新导出后的编码可能不同，因此可能被视为新照片。当前系列 ID 为 `qingdao`、`erdaohai-film`、`songzhou-streets` 和 `mid-autumn-streets`。仅在测试夹具中保留布局示例，不会在真实网站显示。

新系列可以使用新的 `--collection` ID，例如 `city-walk`。系列 ID 只能包含小写英文、数字和连接号。

## 管理作品与系列

在 `content/collections.json` 中编辑系列的 `title`、`subtitle`、`category`、`year` 和 `description`。`photos` 数组顺序就是系列内照片顺序，`cover` 填该系列中的照片 ID。系列的 `dateRange` 记录原图 EXIF DateTimeOriginal 的日期范围；构建按 `dateRange.start` 从新到旧排序，没有日期的系列放在最后，不把导入时间当作拍摄时间。胶片导出文件中的日期可能是扫描日期，需要结合实际拍摄记录确认。当前首页为青岛映像 01 号，松州系列为 20 号封面。单张名称使用主题加编号，替代文字已根据画面补充；后续导入自动生成的标题和替代文字仍需要人工完善。

胶片系列在清单中标记 `"medium": "film"`，首次导入新系列时使用 `--medium film`。胶片扫描文件的相机字段可能指扫描仪，拍摄时间也可能是扫描时间，因此胶片信息要逐张手动填写 `capture`，不采用扫描文件的机型和时间。二道海系列当前逐张标注 `Ricoh Elnica 35` 和 `Kodak UltraMax 400`；没有可靠记录的光圈、快门等参数保持空白。

从作品清单删除一张照片即可取消网站展示。图片文件不会自动删除，以免误删；正式发布前也可移除已经不再引用的图片，但公开仓库历史可能仍保留它们。只有准备公开的图片才应进入仓库。

在 `content/site.json` 中修改摄影师名字、首页文字、关于介绍、个人照和博客地址。`siteUrl` 已配置为 `https://suxiaogang223.github.io/photography`，构建会增加 canonical、sitemap 和 robots 文件。更换域名时应同步修改该字段。

## GitHub Pages 部署

项目通过 `.github/workflows/pages.yml` 发布。后续更新流程：

1. 修改作品清单或导入照片，运行 `npm run check` 并检查本地预览。
2. 提交本项目源码和展示图，推送到独立的 `photography` 仓库 `main` 分支。不提交 `node_modules/`、`dist/`、`test-results/` 或原图。
3. Photography Pages 工作流自动安装依赖、运行测试、构建并发布，也可手动运行。仓库 Settings → Pages 的 Source 使用 GitHub Actions。
4. 在 Actions 中确认部署成功，再检查正式网址 `https://suxiaogang223.github.io/photography/`。现有博客仓库无需变更。

构建默认路径前缀为 `/photography/`。如果更换仓库名，设置仓库 Actions 变量 `SITE_BASE_PATH` 为新的路径，例如 `/photos/`。自定义摄影站域名部署时将它设为 `/`，并在 Pages 中配置域名和 HTTPS。切勿只修改链接而忘记构建前缀。

本地验证根路径部署可以运行：

```sh
SITE_BASE_PATH=/ npm run dev
```

GitHub Pages 站点上限为 1 GB，月带宽软限制为 100 GB。构建在 500 MB 时提醒，950 MB 时拒绝发布，留出空间余量。Git 历史会累积图片旧版本，因此不应用仓库存放完整照片库。[GitHub 官方限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

## 将来迁移图片存储

作品清单记录相对路径，不记录 GitHub 图片域名。现在 `mediaBaseUrl` 留空，照片从同站的 `assets/media/` 加载。

将来把 `assets/media/` 上传到对象存储，保留 `media/系列ID/文件名.webp` 这样的对象路径，再将 `content/site.json` 中的 `mediaBaseUrl` 改成自己的 HTTPS 图片域名，例如 `https://images.example.com`。网站会加载 `https://images.example.com/media/系列ID/文件名.webp`，页面和作品 ID 不变。

本阶段构建仍保留本地图片副本，并检查其存在。正式迁移时需要进一步改为独立的图片发布流水线、停止把图片副本复制进 Pages 产物，并完成备份、缓存和访问验证；仅配置远程地址不会解除 Pages 产物大小限制。
