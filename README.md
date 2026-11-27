# Kindle 日常工作台

两页竖屏、无卡片、黑白宋体布局。当前可在 Mac 上运行、管理待办，并导出 `1072 × 1448` 的 PNG；尚未安装到 Kindle 或部署到常开主机。默认地区是东京示例坐标，不是实时定位结果；可用环境变量 `DEFAULT_LOCATION` 设置自己的地区。

- 第一页：时钟、公历与农历、月相与照亮比例、月出月落、满月倒计时、节气、月历、温度折线与降雨概率柱图、湿度、体感、风、日落、年度进度。
- 第二页：今日待办、完成状态、Codex 两个额度窗口的剩余百分比和重置时间。这里的额度不是剩余 token 数量。
- 管理页：两页预览与切换、PNG/SVG 导出、待办编辑、城市/经纬度设置、浏览器定位、数据来源状态。
- 账单与鲨鱼记账暂不在本版范围内。

此目录是保留的本机版本。当前手机流量/云端/Kindle工作在
[手机直连版](https://github.com/lihr-crypto/kindle-mobile-cloud-public)，本目录的同一网络与Mac常开条件只适用于本机服务；
两套数据库独立，设备接入请参阅直连版的安装说明。

## 启动与使用

需要 Node.js 24 或更高版本。字体已包含在项目中。

```sh
# 在本仓库根目录执行
npm ci
npm run fonts
npm start
```

本机打开 [管理页](http://127.0.0.1:8789/)。新增待办、切换页面或修改地点后，预览会更新。独立预览每分钟更新；管理页每 30 秒更新状态。页面上“示例预览”使用独立 fixture，不会写入真实待办或替代真实数据。

手机日常使用打开 `/mobile`，例如 [本机手机页](http://127.0.0.1:8789/mobile)。这是可交互的 HTML 网页，提供“今日 / 事项 / 设置”三个入口，保留黑白无卡片风格。待办直接新增、编辑、勾选完成或重新打开；有截止日期的未完成事项会在月历上标点。未来待办与已完成事项可展开查看。删除需要页面内确认。

手机页与 Kindle 管理页共用同一 SQLite 清单，不必再向 Kindle 手动传文件。手机操作保存后立即刷新，其他已打开页面最多等待约 30 秒；Kindle 之后接入的定时拉取会取得更新后的画面。Safari 可通过“分享 → 添加到主屏幕”打开独立窗口。当前添加到主屏幕、iPhone Safari 真实触摸与定位仍待手机验收。

本轮用户决定暂不接 Apple 同步。因此手机页的月历圆点表示工作台待办日期，不能当成 Apple 日历事件；Apple 提醒事项中的任务也不会自动出现。同步接收端与快捷指令均未启用。

手机页包含 PWA manifest、图标与应用外壳 Service Worker。Worker 只缓存公开网页外壳，不缓存 API、待办或额度数据。HTTPS/localhost 的 Service Worker 支持不代表网页能独立在后台持续采集：离线重新打开时仍需连接后台才能取得私人数据。普通局域网 HTTP 下使用在线网页即可。

手机与 Mac 在同一网络时，在本机管理页点击“显示访问密钥”，复制一个与 Wi-Fi 对应的网络地址到 iPhone Safari，使用管理密钥登录。不要将管理密钥或设备密钥分享出去。局域网 HTTP 适合当前开发验证；正式远程访问需受保护的 HTTPS。

```sh
npm test
npm run render:demo
npm run export:live
```

- `outputs/demo/`：可复现的完整示例画面，日期固定为 2026-10-13，东京示例天气与额度。
- `outputs/live/`：当前本机服务的真实画面与摘要，已忽略版本控制，目录与文件分别为 `0700` 和 `0600`。
- `outputs/verification/`：开发期间的浏览器截图。截图中的验证事项是临时数据，已从真实清单清理。

PNG 是主要显示产物；SVG 引用 Noto Serif CJK SC 字体，其他电脑直接打开 SVG 时需安装该字体。字体脚本从官方 Noto 仓库的固定提交下载并验证 SHA-256，不使用系统字体替代。

## 实际位置更新

默认是 `东京（示例）`，`35.68, 139.69`，`Asia/Tokyo`；启动前设置环境变量 `DEFAULT_LOCATION`（JSON，如 `{"name":"你的地区","latitude":35.68,"longitude":139.69}`）即可换成自己的地区，不要写进仓库。也可通过“使用当前位置”替换，也可勾选“页面打开时自动更新位置”。不会在首次打开页面时自动申请定位。

定位需要浏览器权限和安全上下文；iPhone 的普通局域网 HTTP 地址不满足要求。见 [Geolocation API 文档](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)。HTTPS 尚未配置，iPhone 实际 GPS 接入尚未验收。

位置只保留最后一次经纬度与更新时间，不记录轨迹。坐标保留三位小数，变化约 500 米且距离上次发送至少五分钟时自动更新；手动“使用当前位置”立即更新。坐标用于后台天气请求和本地天象计算，天气请求会将其发送到 Open-Meteo。关闭页面或进入后台时不保证持续跟随，继续使用最后保存位置；手动选择固定地区会停止位置跟随。定位模式的时区取手机系统时区，跨时区旅行时应开启系统自动时区或在管理页设置。

## 数据与失败行为

| 数据 | 获取方式 | 频率与失效 |
| --- | --- | --- |
| 天气 | [Open-Meteo Forecast API](https://open-meteo.com/en/docs)，明确坐标与时区 | 15 分钟采集；30 分钟后标记旧值，2 小时后停止展示为当前天气 |
| 月相、月出月落、日落、节气 | Astronomy Engine 后台本地计算 | 随摘要生成，地点/日期变化立即体现 |
| 日历、时钟、年进度 | ICU 和后台时区计算 | PNG 的时钟按生成时刻显示；静态文件不是独立运行的时钟 |
| Codex | 已登录 CLI 的 `account/rateLimits/read` | 5 分钟采集；10 分钟后标记旧值，30 分钟后停止显示当前比例 |
| 待办 | SQLite | 保存后即时展示；逾期 → 优先 → 其他今日事项，未来事项不占当前页 |

天气温度与降雨使用独立量纲；缺失点断开温度线，不补成零。共八个两小时刻度，跨午夜标注“次日”。未到新采集时刻仍显示已保存快照；单一来源失败不会擦除其他来源。到达额度重置时刻但未取得新读数时显示等待更新，不自行变成 100%。CLI 只执行初始化和额度读取，不启动模型任务。其 RPC 定义见 [官方 App Server 文档](https://learn.chatgpt.com/docs/app-server)。

无实体设备时显示“设备待接入”，不伪造电量。示例模式的 75% 电量仅用于排版。

## 存储与访问

`.state/dashboard.sqlite` 保存配置、待办及最后有效快照；`.state/credentials.json` 保存随机生成的两个访问密钥。删除 `.state` 会丢失本版数据。备份 SQLite 时应先正常停止服务，避免遗漏 WAL 文件。

本机直连默认可管理；非本机请求需密钥。设备密钥仅允许读取画面/摘要及上报设备状态，不能修改待办、配置或读取管理密钥。访问密钥通过请求头传递，不放在 URL 中。浏览器登录使用 HttpOnly、SameSite=Strict Cookie。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DASHBOARD_PORT` | `8789` | HTTP 端口 |
| `DASHBOARD_HOST` | `0.0.0.0` | 当前允许同一网络手机访问；只需本机时可设 `127.0.0.1` |
| `DASHBOARD_STATE_DIR` | 项目下 `.state` | 私有状态目录 |
| `DASHBOARD_CODEX_PATH` | `codex` | 已登录 Codex CLI 可执行文件 |
| `DASHBOARD_TRUST_LOOPBACK` | 开发时 `1` | 正式或反向代理环境应设 `0` |
| `DASHBOARD_ALLOWED_HOSTS` | 本机地址 | 额外允许的域名，逗号分隔，不含端口 |
| `DASHBOARD_SECURE_COOKIE` | `0` | 正式 HTTPS 设 `1` |

`NODE_ENV=production` 也会关闭本机自动信任；带 `Forwarded` 或 `X-Forwarded-For` 的请求不会因来源是环回地址而自动获得管理权限。已有数据不会被示例模式覆盖。

## Kindle 接入契约

当前只完成服务侧契约，没有可直接运行的 PW4 安装包。设备取图使用 `X-Device-Token` 请求头：

| 入口 | 含义 |
| --- | --- |
| `GET /frame/current.png` | 手机选定的当前页；设备无需解析 JSON 才能翻页 |
| `GET /frame/weather.png` | 天气日历页 |
| `GET /frame/work.png` | 待办额度页 |
| `GET /api/snapshot` | 带来源状态、采集时间和当前页的摘要 |
| `POST /api/device/status` | JSON `{"batteryPct":75}` 或 `{"batteryPct":null}`，仅上报实际读数 |

计划采用 KUAL + FBInk + PNG，先验证真实屏幕尺寸、两页静态显示、退出恢复阅读、分钟刷新，再验证联网、独立缓存、休眠唤醒和耗电。Kindle 只需 Wi-Fi 与供电，不需要持续插着电脑；要实现 Mac 关机后仍更新，后台与 Codex 采集必须迁移到可信常开主机并完成登录与持续运行验证。

本轮没有上传真实数据、公开发布、购买云资源、运行 Kindle 安装器或改动设备系统。完整状态见 [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md)。

## 参考项目与许可

- [Mibslee/kindledashboard](https://github.com/Mibslee/kindledashboard)，提交 `cf9e12166c11f047cd44aebfe5e396b3e8995e26`：SVG/PNG 与 FBInk 显示思路。版式以用户确认的无卡片图片为准，本项目重新实现模板。
- [softmutiny/kindle-ai-quota-dashboard](https://github.com/softmutiny/kindle-ai-quota-dashboard)，提交 `4e0b10ab78d9cbe31991f1f192a1ae5df717999a`：保留 Codex 只读采集器与其依赖，原 MIT 许可位于 `licenses/codex-upstream-MIT.txt`。
- Noto Serif CJK SC：SIL OFL 1.1，许可位于 `licenses/NotoSerifCJK-OFL.txt`；固定字体提交 `f8d157532fbfaeda587e826d4cd5b21a49186f7c`。
- Astronomy Engine：MIT；resvg-js：MPL 2.0，包自带许可。
- 天气数据归属 Open-Meteo，天气页保留来源标注。
