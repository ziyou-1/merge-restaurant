# 合成餐厅（原型）

「浪漫餐厅」同类型的合成 + 经营微信小游戏骨架：Cocos Creator 3.8 + TypeScript。
当前已实现**合成棋盘核心循环 + 装修系统**：生成器 → 产出低级物品 → 拖拽合成 → 凑齐顾客订单交付 → 金币 / 经验 → 花金币和菜做装修任务 → 餐厅一步步修回来、解锁新合成链、推进剧情。外加体力系统、离线恢复、本地存档、激励视频接口。

美术已用 gpt-image-2 生成一整套可用素材（物品 40 个、区域 30 态、角色 10 个、UI 面板 6 种九宫格 + 8 个图标 + 壁纸），通过雪碧图 + atlas 运行时切片；换正式美术只需替换 `art-src/` 里的图再跑一次打包脚本。

## 1. 环境

| 工具 | 说明 |
|---|---|
| Cocos Dashboard + Creator **3.8.6** | https://www.cocos.com/creator-download ，装好后在 Dashboard 里下载 3.8.6 编辑器 |
| 微信开发者工具 | 本机已装在 `D:\微信开发者工具` |
| Node ≥ 22.6 | 只用来跑纯逻辑测试和类型检查，可选 |

## 2. 打开与预览

1. Cocos Dashboard → 项目 → **导入** → 选这个文件夹。首次打开会生成 `library/`、`temp/` 等目录（已在 .gitignore）。
2. 资源管理器里双击 `assets/scenes/Main.scene`。
3. 点顶部 ▶ 预览（浏览器），即可拖拽玩。

> 场景是手写的 JSON。如果编辑器打开时报错，兜底做法：新建一个 2D 场景，在 Canvas 下加一个空节点，把 `GameManager` 组件拖上去，保存后一样能跑——所有 UI 都是代码创建的，不依赖场景里的其他节点。

## 3. 构建微信小游戏

> 美术已 2.85 MB，接近微信主包 4 MB 上限；上线前把 `assets/resources` 设成分包（资源管理器里选中 resources 文件夹 → 配置为 Bundle → 微信小游戏分包），或把区域图放远程 CDN。

1. 菜单 **项目 → 构建发布**，平台选 **微信小游戏**，填 AppID（mp.weixin.qq.com 注册小程序账号后获得）。
2. 起始场景选 `Main`，构建。
3. 用微信开发者工具打开 `build/wechatgame/`，真机预览扫码。
4. 广告位：`assets/scripts/config/GameConfig.ts` 里的 `AD_UNIT_ID` 换成流量主后台申请到的 id（需累计 UV 达标后才能开通）。

## 4. 目录

```
assets/
  scenes/Main.scene          场景：Canvas + Camera + Game(GameManager)
  scripts/
    GameManager.ts           入口：读档/新档、搭 UI、接事件、定时 tick、自动存档
    config/GameConfig.ts     ★ 所有数值：链、等级、体力、生成器、订单、奖励、广告位
    config/Decor.ts          ★ 装修内容：两章各 5 个区域 17 个任务（共 34），花费、解锁、剧情、区域开放引子
    core/                    纯逻辑，不依赖 cc，可在 Node 里跑测试
      Board.ts               棋盘：格子、移动/交换/合成规则、生成器充能
      Energy.ts              体力：按时间恢复、离线结算
      Orders.ts              订单：随机生成、判断凑齐、交付扣物品
      Player.ts              金币 / 经验 / 等级
      Daily.ts               每日签到：本地日期、连签 7 天一轮
      Decor.ts               装修进度：区域开放条件、任务顺序、能否完成
      GameState.ts           总控：把上面串起来，对外发事件（change/toast/merge/...）
      Save.ts                存档序列化 + 存储抽象
      Emitter.ts             极简事件分发
    ui/                      视图层，只读 GameState、只发操作，数据驱动
      BoardView.ts           棋盘绘制、拖拽/点击、物品视图同步与动画
      ItemView.ts            单个物品 / 生成器的显示（换美术改这里）
      Hud.ts                 顶栏：等级经验条 / 金币 / 体力
      OrderPanel.ts          订单卡片
      RestaurantView.ts      餐厅全景：区域色块随装修等级变化（换美术改这里）
      TaskPanel.ts           装修任务卡：花费 / 缺什么 / 一键完成或跳回棋盘
      StoryDialog.ts         剧情对话框，多段排队
      Popup.ts               通用弹窗（遮罩 + 纸面板 + 关闭）
      DailyPanel.ts          签到面板 + 底栏签到按钮（可领时红点）
      EnergyPanel.ts         补充体力：看广告 / 分享（每日限次）/ 订阅提醒（配了模板 id 才显示）
      Toast.ts               提示
      Audio.ts               音效：resources/sfx 的 9 个片段，playOneShot；「音效/静音」开关存本地
      Tutorial.ts            新手引导：跳动箭头 + 一句话，点生成器 → 合成 → 交单 → 开餐厅四步，进度存档
    platform/Wx.ts           微信能力封装：云开发 init/调用、服务端校时（单调时钟）、激励视频、震动；非微信环境自动兜底
    platform/CloudSave.ts    云端存档：本地为主，15 秒合并推送、切后台立刻推、开局拉一份比 savedAt
      ui/Art.ts              美术资源：读 atlas.json 把雪碧图切成 SpriteFrame，缺图自动退回色块
      ui/Theme.ts            配色 + makePanel（九宫格面板/按钮，可染色）/ makeIcon / addLabel 等小工具
  resources/art/             21 张雪碧图 + atlas.json（tools/pack_art.py 生成，共 2.85 MB）
  resources/sfx/             9 个音效 wav（tools/gen_sfx.py 合成的占位音，同名替换即可）
art-src/                     雪碧图原图（gpt-image-2 出的 1536×1024 透明 PNG），换美术改这里
tools/pack_art.py            打包脚本：缩放、量化、按格算裁切矩形
tools/gen_sfx.py             占位音效生成（纯 Python 合成，8 kHz 单声道 wav）
extensions/dev-refresh/      编辑器小插件：GET 127.0.0.1:7457/refresh 触发资源刷新，AI/脚本改完代码不用手点
build-templates/wechatgame/cloudfunctions/  三个云函数（getServerTime / saveGame / loadGame），构建时自动拷进微信工程
tools/sim.ts                 节奏模拟器（npm run sim）
tests/core.test.ts           纯逻辑测试
settings/v2/packages/project.json  设计分辨率 750×1334，竖屏，宽度适配
```

## 5. 玩法与操作（当前版本）

- **点击生成器**：消耗 1 体力 + 1 次充能，在最近空格产出 1 级物品（15% 概率 2 级）。充能每 30 秒回 1，上限 12。
- **拖拽**：拖到空格 = 移动；拖到同链同级 = 合成升 1 级；其他 = 交换。
- **点击普通物品**：选中，底栏出现「出售」按钮。
- **订单卡**：凑齐后卡片变绿，点一下交付，得金币 + 经验；金币会从订单飞到顶栏。右上角「换」可换掉不想做的单，三张卡共用 3 分钟冷却（冷却中按钮变灰）。
- **餐厅页**：底栏「餐厅」按钮切换（括号里是现在能做的任务数），顶部按章节分页签。每个任务花金币 + 交几道菜给工人，完成后区域变新、给经验、可能解锁新链、播剧情；区域刚开放时播引子剧情。
  - 第 1 章「重开餐厅」：门面 → 大堂 → 厨房 → 吧台，门面修到第 3 步开花园，17 步。
  - 第 2 章「生意兴隆」：花园做完开露台 → 咖啡角（解锁咖啡链）→ 外卖窗口 → 二楼包间；露台第 2 步开儿童角，17 步，以美食节宴席收尾。
- **解锁**：修好炉灶解锁肉类，修好吧台解锁甜品，装咖啡机解锁咖啡；面点 / 饮品 / 蔬菜初始就有。
- **升级**：每升一级送 20 体力 + 30×新等级金币（`LEVEL_UP_REWARD`）。
- **新手引导**：新档前四步（点生成器 → 合成 → 交单 → 进餐厅）有箭头指引，做完就不再出现；老存档视为已完成。
- **音效**：顶栏右下「音效」按钮切静音，设置存在本地不随存档同步。占位音是合成的哔哔声，正式音效放到 `assets/resources/sfx/` 同名替换（tap/merge/coin/task/levelup/click/error/sell/reward）。
- **体力**：上限 100，每 2 分钟回 1。底栏「补充体力」：看广告 +30、分享给好友 +10（每天 3 次）；非微信环境两者都直接发奖，方便调试。
- **签到**：底栏「签到」，7 天一轮（60 金币 / 20 体力 / 120 / 30 / 240 / 50 / 500+50），断签重头；可领时按钮带红点，老玩家进游戏自动弹。日期固定按北京时间算，不受手机时区影响。
- **离线提示**：离开超过 10 分钟回来，提示离线时长和恢复的体力。
- **存档**：每次变化后 0.5 秒自动存本地，切后台也存（配了云就同步推云端）。页脚「调试：清档重开」由 `GameConfig.DEBUG_TOOLS` 控制，发布前改成 false；清档会连云端一起删。

## 6. 测试与类型检查（不需要打开编辑器）

```bash
npm test
```

```bash
npm i && npm run typecheck
```

`npm test` 跑 `tests/core.test.ts`（21 个用例：合成规则、生成器充能、体力恢复、订单交付、升级、装修配置自洽、区域开放顺序、章节开放与引子剧情、任务完成与解锁、存档往返、离线结算）。
`npm run typecheck` 用 `@cocos/creator-types` 的 `cc.d.ts` 对全部脚本做严格类型检查，等价于编辑器里的编译检查。

```bash
npm run sim -- --seed 1
```

`tools/sim.ts` 是节奏模拟器：一个"体力用光就走、回满再来"的自动玩家把两章从头打到尾，打印每个任务在第几局完成、卡在钱还是卡在菜。改数值后跑几个 seed 看结果，比真机快得多。当前基准：第一章 11～17 局（≈3 天），第二章到第 28～45 局（≈1～1.5 周）。

## 数值设计的锚点

- 一个 L 级物品要点 2^(L-1) 次生成器 = 2^(L-1) 点体力；体力每 2 分钟回 1，上限 100。
- 交订单每点体力换 `COINS_PER_SPAWN`（4）金币，两件的单 +20%，玩家每升一级 +5%（封顶 2 倍）；直接卖只换 1 金币/体力，所以订单永远更划算。
- 订单最高只要 6 级（32 点体力），7 级只出现在装修任务里。
- 任务金币按"几局能攒到"倒推：第一章共约 1700，第二章约 6000。

## 7. 美术流程

1. 出图：每类一张雪碧图，网格约定写在 `tools/pack_art.py` 顶部（物品 4×2、区域 3×2、角色 2×2 / 3×2、UI 面板 3×2、图标 4×2、壁纸整张），透明底，每格一个对象居中留边。
   UI 面板要求四角圆角一致、中间纯色、无外阴影，运行时按四边各 30% 做九宫格拉伸；按钮底图是近白色，代码里用 `Sprite.color` 染成各种颜色。
2. 放进 `art-src/` 同名覆盖，跑 `python tools/pack_art.py`。
3. 编辑器刷新资源（`curl http://127.0.0.1:7457/refresh` 或资源管理器点刷新）。

注意：编辑器把 png 默认导入成 `texture` 类型，`Art.ts` 就是按 `art/xxx/texture` 路径加载的，不要在检查器里改成 sprite-frame。

## 8. 云开发：校时 + 云存档（可选）

不配也能玩：`CLOUD_ENV` 留空时游戏纯本地，时间用本机时钟。要防"改手机时间刷体力"和"换手机接着玩"就开云：

1. 微信开发者工具 → 云开发 → 开通，记下环境 id，填到 `config/GameConfig.ts` 的 `CLOUD_ENV`。
2. 数据库新建集合 `saves`（权限随意，云函数用管理员身份读写）。
3. Cocos 构建微信小游戏后，`build/wechatgame/cloudfunctions/` 里已有三个云函数（来自 `build-templates/`）。在开发者工具的 `project.config.json` 加一行 `"cloudfunctionRoot": "cloudfunctions/"`，然后右键每个云函数 → 上传并部署（云端安装依赖）。
4. 启动流程：美术加载、`getServerTime` 校时、`loadGame` 拉云存档三件事并行，谁失败都退回本地；本地和云端存档按 `savedAt` 取新的。每次变化 0.5 秒写本地、15 秒合并推云端，切后台立刻推。
5. `now()` 是单调时钟：校时后不受本机时间影响；没校时的情况下把时间往回拨也不会倒退，往前拨只能骗到下一次校时之前。云存档只在校时成功后才推，`savedAt` 由云函数用服务端时间覆盖，所以手机时间不准的设备也写不出“更新”的假存档。

## 9. 编辑器小插件 dev-refresh

编辑器在后台时文件监听不可靠，改完代码可能不重新编译。项目自带 `extensions/dev-refresh`，编辑器启动时自动加载，提供：

- `GET http://127.0.0.1:7457/refresh` 刷新资源并重新编译
- `GET /open-scene?uuid=` 在编辑器里打开场景（预览跑的是当前打开的场景）
- `GET /start-scene?uuid=` 固定预览起始场景
- `GET /ping` 探活

构建产物不包含 extensions/，不影响发布。

## 10. 下一步

按优先级：

1. **真机跑一遍第一章**，用 `npm run sim` 的基准（第一章 11～17 局）对照真实感受再微调数值。
2. **第三章**：`config/Decor.ts` 加 `CHAPTERS` 条目和 5 个区域（每章 5 个区域刚好一页），出 5 张区域雪碧图，逻辑不用动。
3. **订阅消息**：mp 后台申请“体力已回满”类模板，填 `SUBSCRIBE_TMPL_ID`，补充体力面板就会多一行“回满提醒我”；推送要配云函数定时任务（未做）。
4. **广告位**：申请流量主，把 `AD_UNIT_ID` 换成真的；加插屏广告位。
5. **分包**：`assets/resources` 设成分包，主包控制在 4 MB 内。
6. **提审材料**：隐私保护指引、自审自查报告、ICP 备案。
