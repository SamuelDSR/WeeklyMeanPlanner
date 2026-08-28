# 食谱管家（自建版）

家庭共享的生活助手，自建在你自己的服务器上：

- **吃饭** —— 菜品库（照片 + 做法步骤）→ 排下周菜谱 → 自动汇总购物清单 → 到点提醒做饭 → 吃完记进历史
- **记账** —— 日常开销，可以开子账本单独归拢一次度假、一场装修
- **卡包** —— 全家共用的会员卡，结账时全屏放大给扫码枪

用你自己的域名（比如 `meal.xxx.fr`），不依赖任何第三方云服务。

## 功能一览

**菜品库**
- 照片（上传时自动压成主图 1600px + 缩略图 400px，按 EXIF 摆正）→ 第 6 节
- 做法步骤，每一步可以配图；「跟着做」全屏模式带计时器
- 一份够几人吃（份数换算的依据）→ 第 8 节
- **可选食材**：香菜、辣椒这种有更好没有也行的，购物清单里单独一行 → 第 26 节
- **步骤可拖动排序**（手机上也能拖，另有上/下箭头）→ 第 28 节
- **用 AI 录菜谱**：贴文字 / 给网址（要 API key），或者「贴 JSON」——
  拿提示词去问你自己的订阅，把结果贴回来，**不用配任何 key** → 第 29 节
- 健康分 / 喜好分，两套独立的 1-5 分 → 第 16 节
- **买现成的**：熟食、冷冻披萨这类，只填「一份买多少」，不用登记食材和做法 → 第 13 节

**每周菜谱**
- 每周只排 **午餐 + 晚餐**：早饭各人各吃，不进计划 → 第 30 节
- **本周 / 下一周** 两周并行：本周随时改，下一周提前排 → 第 9 节
- 一顿可以配好几道菜；**出去吃** 的那顿不做饭、不进购物清单 → 第 11、14 节
- **主食**（米饭 / 面条 / 意面）按人按顿自动配，默认吃什么设一次就行 → 第 27 节
- 自动排菜只补空格，不会覆盖手工排的；已确认的周受保护 → 第 10 节
- 「本周备餐」按家庭人数算出每道菜要做几份，菜名可点进做法

**购物清单**
- 按份数放大用量，同类单位自动合并（1 kg + 200 g 土豆 = 1200 g）→ 第 7、8 节
- 主食按「每人份量 x 人数 x 顿数」单独算，可选食材单独成行 → 第 26、27 节
- 按食材分类分组，勾选有离线队列（断网也能勾，联网自动补发）

**做饭提醒**
- 到点前推送该准备哪几道菜；提前量会自动考虑最慢那道菜的耗时 → 第 20 节
- 家庭开关 + 每台设备各自订阅；出去吃的那顿不提醒

**吃饭历史**
- 整周过完自动归档；`< >` 翻周查看，菜名可点进做法 → 第 15 节
- 每一顿单独打喜好分；总览给出健康 / 喜好均分
- 逐餐记录通过 `GET /api/history` 输出，留给以后的推荐算法当输入

**记账**
- 日常开销：金额 / 日期 / 分类 / 备注 / 谁付的 → 第 31 节
- **子账本**：度假、装修这类单独拢起来，既能单独看，也仍算进总账 → 第 31 节
- 按月翻看，按分类汇总；多货币各算各的，**从不换算**

**卡包**
- 会员卡存成条码 / 二维码，点一下全屏放大给扫码枪 → 第 32 节
- EAN-13 / EAN-8 / UPC 会验校验位；码扫不出来还能存实拍照片兜底

**账号与家庭**
- 注册要管理员审核通过才能登录 → 第 5 节
- 家庭邀请码、成员管理、转让创建者 → 第 12 节
- 设置一页装三段：账号设置 / 家庭管理 / 用户审核

**其它**
- 界面支持 简体中文 / English / Français → 第 19 节
- PWA：可加到主屏、离线能看菜谱；手机端针对拇指操作和 iOS 安全区做过适配 → 第 18 节

## 技术栈

- **前端**：React + Vite + Tailwind CSS，打包成静态文件
- **后端**：Node.js + Express，提供 REST API
- **数据库**：PostgreSQL
- **鉴权**：JWT，存在 httpOnly cookie 里（不是 localStorage，防 XSS 窃取）
- **图片存储**：本地磁盘（Docker volume），不是对象存储
- **多人协作**：轮询（每 8 秒刷新一次 + 窗口重新聚焦时立即刷新），不是 WebSocket 实时推送
- **离线支持**：Service Worker 缓存已加载过的数据（离线能看菜谱/菜单），购物清单勾选
  有专门的离线写队列（离线时先记本地，联网后自动补发）
- **图片处理**：sharp（上传时压缩 + 按 EXIF 摆正 + 生成缩略图）
- **推送通知**：Web Push（VAPID），自己写的 Service Worker 处理 `push` 事件
- **多语言**：手写的极简 i18n（约 60 行），中 / 英 / 法三份词典

一个容器镜像（`api`）同时提供 API 和前端静态文件，`docker compose up` 就能整套跑起来。

## 跟 Firebase 版本的取舍（诚实说明）

| | Firebase 版 | 这一版（自建） |
|---|---|---|
| 实时同步 | 真实时（onSnapshot 推送） | 轮询，几秒延迟 |
| 离线读 | 自动、完整 | Service Worker 缓存，够用但没那么全面 |
| 离线写 | 自动排队同步 | 只有购物清单勾选做了离线队列，其他操作（改菜谱、改菜单）需要联网 |
| 运维 | 零运维，Google 管 | 你自己维护服务器、数据库备份、证书续期 |
| 费用 | 免费额度内基本不花钱 | 你服务器本来就有，增量成本几乎是 0 |
| 数据主权 | 数据在 Google 那 | 数据完全在你自己的服务器上 |

想换成真正的实时同步，就在 `server/src/index.js` 里加一个 WebSocket（`ws` 包），
成员操作后广播"数据变了"，前端收到立即刷新，不用等轮询周期。
这一版故意用轮询，把复杂度压下来。

## 一、部署到你的服务器

### 1. 准备工作

服务器上需要：Docker + Docker Compose（`docker compose version` 能跑通就行），
以及你已经在用的 nginx。

### 2. 拉取/上传项目代码

把这个项目放到服务器上某个目录，比如 `/opt/meal-planner`。

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，改三个值：
```bash
POSTGRES_PASSWORD=一个强密码
JWT_SECRET=一串随机字符串，比如跑 `openssl rand -base64 32` 生成
ADMIN_EMAIL=你自己的邮箱          # 这个邮箱注册后就是管理员
```

`ADMIN_EMAIL` 留空也能跑：那样**第一个注册的账号**会自动成为管理员。
这个邮箱如果已经注册过了，重启容器时会自动把它提成管理员。

### 4. 启动

```bash
docker compose up -d --build
```

第一次启动会：编译前端、装后端依赖、初始化数据库表结构（`server/src/schema.sql`
只在 Postgres 数据目录为空时自动执行一次）。跑完之后 `api` 服务监听在
`127.0.0.1:8080`（只监听本地，不直接对外，靠 nginx 转发）。

验证一下：
```bash
curl http://127.0.0.1:8080/api/health
# 应该返回 {"ok":true}
```

### 5. 账号审核（谁能用这个应用）

注册是开放的，但**注册完登不进来**——新账号先进"待审核"队列，要管理员点通过：

```
陌生人注册  ->  status = pending  ->  登录被拒（提示等待审核）
                                        |
管理员在「设置 → 用户审核」里点"通过"  ->  status = approved  ->  可以正常登录
```

管理员登录后，在底部的**设置** tab 里会多出「用户审核」这一段（详见后面的“设置这一页”）：

- **通过 / 拒绝**：拒绝是可逆的，账号记录还留着，之后还能改回通过
- **设为 / 取消管理员**：可以把管理员转给别人，之后自己再退下来
- **删除**：彻底删掉，邮箱释放出来可以重新注册

几个防手滑的限制：不能拒绝或删除自己的账号；不能取消**最后一个**管理员
（不然就没人能审核了）。另外"拒绝"是立刻生效的——被拒绝的账号手上那个还没过期的
登录 cookie 下一次请求就失效。

家庭邀请码和这套审核是两件独立的事：审核决定"能不能用这个应用"，
邀请码决定"进哪个家庭"。审核通过后照旧是建家庭或用邀请码加入。

### 6. 菜品照片

上传的照片不会按原样存下来。手机随手一拍就是 4MB，几十道菜就能把菜品库拖慢，
所以上传时会用 sharp 压成两个尺寸：

```
原图 3833x4972 / 3.9MB
      |
      +-> 主图   1600px 长边 / ~280KB   详情页用
      +-> 缩略图  400px 长边 /  ~22KB   菜品库列表用
```

顺带做了两件事：按 EXIF 方向自动摆正（不然手机竖拍的照片在网页上会躺倒），
以及换图/删菜时把不再引用的文件删掉，`uploads` 卷不会越堆越大。

单张上限 12MB，超了返回 413；不是图片或者文件坏了返回 400。

### 7. 食材单位怎么合并

食材的单位在表单里是个下拉框（`/api/units` 提供选项）。同一个「量纲」里的单位
汇总购物清单时会换算后相加，显示成**用到过的最小单位**：

```
菜谱A: 土豆 1 kg  ┐
菜谱B: 土豆 200 g ┴->  购物清单: 土豆 1200 g      最小单位是 g

菜谱A: 米 2 kg    ┐
菜谱B: 米 3 kg    ┴->  购物清单: 米 5 kg          都用 kg，就不会变成 5000 g
```

能换算的：`mg/g/两/斤/kg`（基准 g）、`ml/cl/dl/L`（基准 ml），中文写法
（克/公斤/毫升/升…）也认得。

换算不了的按原样、只跟单位完全相同的合并 —— `个 / 只 / 片` 之间没有固定倍数
（1 只 ≠ 1 个），`勺 / 杯 / 汤匙` 各家标准不一，`适量 / 少许` 没有数值。
所以「2 个西红柿」和「300 g 西红柿」会分成两行，这是故意的：它们没法相加。

要加新单位或者改换算关系，只改 `server/src/units.js` 一个文件：
`CONVERTIBLE_GROUPS` 管换算，`UNIT_OPTIONS` 管下拉框里显示哪些。

### 8. 份数换算（要做几份）

每道菜记一个「一份够几人吃」（`recipes.servings`），家庭记一个「几口人」
（`families.member_count`，在本周菜谱页面点右上角改）。菜单里一道菜被排了几顿，
就按这个算出要做几整份：

```
需要的份量 = 出现顿数 x 家庭人数
要做几份   = ceil(需要的份量 / 一份够几人)

hachis parmentier 一份够 4 人，家里 3 口，排了 4 顿晚饭
  -> 4 x 3 = 12 人份  ->  12 / 4 = 3  ->  做 3 整份
  -> 购物清单里的食材也 x3
```

用 `ceil`（往上取整）是因为菜是整份做的 —— 吃不完的放冰箱下一顿吃，宁可多不可少。
本周菜谱页面顶部的「本周备餐」会把这笔账列出来。

顺带修掉一个老问题：以前汇总购物清单时用的是 `Set`，同一道菜排两顿也只算一次的量。

### 9. 本周 / 下一周（两周并行）

菜单页和购物清单页顶上都有 **本周 / 下一周** 切换：本周随时能改（今天之后的饭想换就换），
下一周可以提前排。两周各自有自己的菜单和购物清单。

```
GET  /api/menu?week=current|next        找不到就返回空骨架（不建行），页面永远打得开
POST /api/menu/generate?week=current|next
GET  /api/shopping?week=current|next
PATCH /api/menu/slot                    这一格属于哪一周，由传进来的 date 反推
```

**哪个周一算「本周」由服务端按家庭时区算**（`families.timezone`，默认 `Europe/Paris`），
客户端只传 `current` / `next`。容器跑在 UTC，家在巴黎 —— 巴黎周一凌晨 1 点
UTC 还是周日，直接用服务器时间会整周错开一天。

`PATCH /api/menu/slot` 特意改成**从日期反推那一周**，而不是"最新那一周"：
两周同时可编辑时，"最新"这个概念就不再唯一了。

#### 整周过完自动归档

任何"整周都已经过去"且**有内容**的未确认周，会在下次读菜单/清单/历史时自动盖上
`confirmed_at` 进历史，并把那些菜标记成做过。空的周不归档（历史里堆一串
"这一周没排菜"没意义）。

懒执行而不是靠定时任务：不依赖进程一直活着，停机几天再打开也能自动补上，
而且是幂等的。

历史页带的是**本周**而不是"最新那一周" —— 现在能提前排下一周了，
那一周还没吃，出现在历史里让人给未来的饭打分就不对了。

### 10. 自动排菜只补空格（不会覆盖手工排的）

**自动排菜（补空格）**只往空着的格子里填，已经排好的菜、标了「出去吃」的格子、
以及那一顿的评分，一律不动。返回 `addedCount` 告诉你补了几格。

以前这里是「整周删掉重建」（`DELETE FROM menu_slots WHERE weekly_menu_id=...`），
按一下就把手工排的菜、出去吃的标记和 per-meal 评分全冲掉了 —— 没有提示也没法撤销。

**已确认（记入历史）的那一周直接拒绝重排**：历史不该被一个按钮改写。真想重排就先点
「取消确认」把这一周从历史里撤下来（排的菜和评分都留着，只是 `confirmed_at` 清空）。

> 菜单没有草稿态：页面上每改一下都立刻写库（`PATCH /api/menu/slot`），
> 所以家人在另一台手机上几秒内就能看到。代价是没有撤销 —— 这也是上面两条保护存在的原因。

### 11. 一顿配几道菜

`menu_slots` 以前是「一格一道菜」（UNIQUE 到 meal_slot），现在一格可以有多行，
一顿配几道菜都行。空格子就是没有行 —— 所以那一整天没排菜也不会整天消失
（页面的 7 天骨架是从 `week_start` 推出来的，不是从行数据反推的）。

同一格里同一道菜不能加两遍：想多做点是把菜谱的「份数」调大，不是加两遍。

### 12. 设置这一页（三段合一）

底部第四个 tab **设置**（`/settings`）按"跟谁有关"从近到远分三段：

```
账号设置   只跟你自己有关     人人可见（称呼、邮箱、界面语言、退出登录）
家庭管理   跟你家有关         加入了家庭才显示；改设置的权限在段内再判断
用户审核   跟整个应用有关     只有应用管理员看得到
```

以前这些散在三个地方（顶部齿轮进家庭管理、只有管理员才有的账号管理 tab、
顶部栏的退出按钮），现在收拢到一个 tab。`/family`、`/admin`、`/admin/users`
这些旧地址会跳到 `/settings`。

这一页用的是 `AuthedRoute`（只判断登录），不能用 `ProtectedRoute` ——
后者会把还没加入家庭的人赶回登录页，而没家庭的人也得能改自己的账号设置。

家庭那一段的内容：家庭名称、**邀请码**、家里几口人、成员列表。

邀请码就是家人加入的凭证 —— 他们注册、等管理员审核通过之后，在登录页选
「加入已有家庭」输入这个码即可。码是 6 位，去掉了 `I O 0 1` 这些看着容易混的字符。

权限分两层：

| 操作 | 谁能做 |
|---|---|
| 看 / 复制邀请码 | 所有成员 |
| 改「家里几口人」 | 所有成员（这是生活事实，而且它决定买多少菜） |
| 改家庭名字、换邀请码、移出成员、转让创建者 | 家庭创建者（`families.owner_id`）+ 应用管理员 |

几条防呆规则：创建者不能被移出（先转让）；创建者手下还有别人时不能退出（先转让）；
最后一个人退出后家庭的 `owner_id` 置空，下一个用邀请码加进来的人自动接管
（否则这个家庭就永远没人管得了）。

### 13. 买现成的（熟食 / 半成品）

有些"菜"是买来直接吃的：超市烤鸡、冷冻披萨、熟食沙拉。新建菜谱时勾上
**买现成的**，表单就只问「一份买多少」，不用登记食材和做法。

实现上它就是一道**只有一行食材、且这行食材就是它自己**的菜谱，所以份数换算和
购物清单合并直接复用现成的逻辑，没有另一套特殊路径：

```
超市烤鸡：一只够 2 人，一份买 1 只
排了 3 顿晚饭，家里 3 口  ->  9 人份 / 2 = 买 5 只
本周备餐显示「买 5 只」（自己做的菜显示「做 N 份」）
购物清单：5 只 超市烤鸡
```

服务端会强制这个形状（步骤清空、食材只留一行且名字跟菜名一致），
所以不管客户端传什么，数据都是自洽的。

### 14. 出去吃

菜单里每一格右上角有个「出去吃」。点上之后这一顿就是下馆子：不做饭、不算份数、
也不进购物清单。它在库里是一行 `recipe_id` 为空、`is_eat_out` 为真的记录，
有个 CHECK 约束保证「要么是一道菜，要么是出去吃」，不会两者都是。

### 15. 历史记录

菜单页有个**确认本周菜单**。确认（`weekly_menus.confirmed_at`）表示"这周就这么吃"，
这一周才会进历史 —— 没确认的还是草稿，不代表真的吃了。确认时顺便把这些菜标记成
做过，推荐算法会尽量避开最近吃过的。

`/history` 页面（菜单页右上角「历史」进）显示：

```
最近 N 周总览    在家吃 / 出去吃顿数 · 健康均分 · 喜好均分
吃得最多         按次数排的菜
每一周           逐顿列出吃了什么，带健康分/喜好分
```

`GET /api/history?weeks=N` 返回的是**逐餐记录**（日期/餐次/菜/评分/是否出去吃），
不只是汇总数 —— 这样以后写推荐算法可以直接拿这份数据当输入。

### 16. 健康分 / 喜好分

健康分和喜好分是两件独立的事，而且**存的地方不一样**：

```
健康分  在菜谱上   这道菜本身健不健康，跟哪天吃没关系
喜好分  在这一顿上  同一道菜这次做得好、上次太干，可以分别记
        菜谱上还留一个"默认喜好"，这一顿没单独评过就用它
```

具体某一顿的分数在 `/history` 页点红心就能改（点已选中的那颗取消，回到默认值）。
菜谱详情页会显示「实际 X.X（N 顿）」—— 那是真吃过之后的均分，
和菜谱上填的默认值分开显示。

```
清蒸西兰花   健康 5 / 默认喜好 2     健康但一般没人爱吃
KFC 炸鸡     健康 1 / 默认喜好 5     好吃但不健康
红烧肉       默认 3，周一那顿 5、周二那顿 2  ->  实际均分 3.5
```

统计均分时只算已评分的，没评的不参与（否则会把平均值拉歪）。

#### 历史不会被删菜谱毁掉

`menu_slots` 上存了**菜名和健康分的快照**（`recipe_name` / `health_score`），
外键是 `ON DELETE SET NULL` 而不是 `CASCADE`。取值规则：

```
菜谱还在  ->  用菜谱上的值（改名、改健康分会同步到历史，因为那是这道菜的属性）
菜谱删了  ->  用格子上的快照兜底（历史不会因为整理菜品库而消失）
```

改菜谱时会顺手刷新一遍快照，所以兜底值始终是最新的。这一顿的喜好分本来就存在
格子上，跟菜谱在不在没关系。

判断"这行是一道菜"看的是菜名快照而不是 `recipe_id` —— 不然 `SET NULL` 把
`recipe_id` 清空时会撞上 `menu_slots_entry_check`，删菜谱会直接失败。

### 17. 轮询不能覆盖刚做的改动

页面数据靠轮询刷新（`lib/poll.js`，8 秒一次 + 窗口重新获得焦点时立刻一次）。
有本地改动的页面必须传 `getVersion`：

```
本地每次改动 version + 1
轮询在请求前后各读一次 version，不一样就把这份数据丢掉
```

不加这个守卫会有个很难查的 bug：原生 `<select>` 弹开再收起会触发 window focus，
轮询立刻发一个请求（拿的是旧数据），而它可能在你的改动保存完之后才返回，
把刚加的菜覆盖回去 —— 表现就是"改完要刷新页面才看得到"。
本周菜谱和购物清单（勾选是乐观更新）都用了这个守卫。

#### 另一半：service worker 不能缓存 API 数据

PWA 的 service worker 一开始把 `/api/...` 配成 `StaleWhileRevalidate`
（先给缓存里的旧数据，再后台刷新）。这对图片没问题，对"刚改完的数据"是灾难：

```
改完之后我们会重新 GET 一次拿最新的份数
  -> SW 直接返回缓存里的旧数据 -> 刚加的菜又消失了
  -> SW 后台刷新缓存
  -> 下一次轮询（8 秒一轮）才拿到新数据 -> 菜再出现
表现：改完要等 4~5 秒才生效（服务端其实只花 4ms）
```

现在改成 `NetworkFirst` + `networkTimeoutSeconds: 3`：在线时永远拿最新的，
网络不通才用缓存兜底，离线看菜谱的能力不受影响。`/api/auth` 故意不缓存。

改完 service worker 配置之后，浏览器要**刷新两次**才会换上新的 SW
（第一次装、第二次接管），或者直接在 DevTools → Application → Storage 清一下站点数据。

### 18. 手机适配上的几个坑

```
index.html          viewport-fit=cover  -> 页面铺到屏幕物理边缘
index.css .pb-safe  padding-bottom: env(safe-area-inset-bottom)
```

`viewport-fit=cover` 和安全区必须成对出现：只写前者，固定在底部的导航栏就会压在
iPhone 的 home indicator 上。底部导航、跟着做的上下操作条都加了安全区内边距，
页面内容用 `.pb-nav`（导航栏高度 + 安全区）。

**输入框一律 16px**：iOS Safari 聚焦字号小于 16px 的输入框时会把整个页面放大，
而且不会缩回去。注意特异性 —— Tailwind 的 `.text-sm` 是 `(0,1,0)`，
光写 `textarea{}` 是 `(0,0,1)` 会被压过去，所以用 `textarea:not([hidden])` 顶上去。
`<select>` 故意不动：iOS 的 select 弹的是原生选择器、不会触发放大，
而且食材那一行本来就挤，字号放大反而更难用。

**点击面积**：手机上手指点得中比看起来紧凑重要。可点的评分图标 20px + `p-2`
（约 36px 点击区），历史里每一顿的喜好分单独占一行 —— 一行塞不下
"菜名 + 5 个健康图标 + 5 个可点的心"。购物清单整行都是按钮，行高 40px。

### 19. 多语言（i18n）

界面支持 **简体中文 / English / Français**，在「设置 → 账号设置 → 界面语言」切换，
按设备记在 `localStorage`（不写在账号上：同一个账号在手机和电脑上用不同语言很正常）。
第一次打开时按浏览器语言猜，猜不中就用中文。

```
frontend/src/i18n/
  translate.js   纯逻辑：查表 / {占位符} / 单复数 / 日期格式化（可以直接 node 里测）
  index.jsx      React 部分：I18nProvider + useI18n()
  zh.js en.js fr.js   界面文案，234 条，三份键必须一一对应
  domain.js      数据库里的中文值 -> 各语言显示名
```

**为什么不用 react-i18next**：只需要"查表 + 占位符 + 单复数"，自己写约 60 行，
省一个依赖，也和项目里其它手写的部分（轮询、离线队列）风格一致。

**界面文案 vs 数据**，这是这次改动里最需要想清楚的一点：

```
界面文案   "保存" "本周菜谱"       -> zh/en/fr 词典，t('common.save')
数据       "晚餐" "蔬菜类" "斤"    -> 存在数据库里（menu_slots.meal_slot 等）
                                     只在显示时翻译：domainLabel(locale, 'meal', '晚餐')
```

数据库里永远存中文。所以切语言不动任何数据，家人各用各的语言也不会打架，
用户自己打的单位（比如"罐头"）认不出来就原样显示。

星期几不再用后端返回的中文，改成从日期算：`formatWeekday('2026-08-24')`
按当前语言输出「周一 / Mon / lun.」。

**单复数**：词条可以写成 `{ one, other }`，由 `Intl.PluralRules` 选。
中文只有一种形式，所以中文词典全是普通字符串。法语的 0 算单数（`0 dernière semaine`），
英语的 0 算复数（`0 meals`）—— 交给 Intl 处理，不要自己写 `n > 1 ? 's' : ''`。

**缺翻译时**显示 key 本身（比如 `menu.filled`），一眼就能看出漏了哪条，
比显示空白好排查。

> 已知缺口：**后端返回的报错信息还是中文**（`{"error":"邮箱或密码不对"}`），
> 前端只是原样转发。要修的话得让后端返回错误码、前端再翻译。

### 20. 做饭提醒（Web Push）

到点提醒该准备哪几道菜。开关在「设置 → 做饭提醒」。

```
提前量   = max(家庭设置的分钟数, 这一顿最慢那道菜的耗时 + 15)
提醒时刻 = 开饭钟点 - 提前量
只在 [提醒时刻, 开饭时刻) 这段窗口里发
```

固定 30 分钟不够：hachis parmentier 要烤 60 分钟，提前 30 分钟通知等于已经晚了，
所以用"最慢那道菜"兜底。限定在开饭前那段窗口，是为了服务器停了一天再开机时
不会把昨天的提醒全补发一遍。买现成的不算"做"的耗时；标了「出去吃」的那顿不提醒。

**两层开关，别混：**

```
家庭开关 + 餐次时间   存服务端，全家共用   决定"要不要发、什么时候发"
这台设备的订阅        存浏览器，一台一份   决定"发给谁"
```

家庭开着但这台设备没订阅，这台就收不到 —— 所以设置页上两个都有。

**平台差异**：Android Chrome/Firefox 和桌面浏览器在普通标签页里就能订阅；
**iOS/iPadOS 16.4+ 必须先「添加到主屏幕」**，Safari 标签页里 `PushManager` 根本不存在。
界面上会直接把这句说清楚，而不是让人对着一个没反应的按钮发呆。

**VAPID 密钥**优先读环境变量（`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`），
没配就自动生成一对存进 `app_settings` —— 开箱能用，而且**重启不变**
（每次重启换一对的话，所有已有订阅会立刻失效）。

**订阅会失效**：用户撤权限、清站点数据、删掉主屏图标，或推送服务自己轮换 endpoint。
唯一的信号是推送时返回 **410 Gone / 404**，收到就把那一行删掉；
其它错误（500、连不上）不删 —— 那是临时故障，删了会误伤还活着的订阅。

**去重**：定时器每分钟跑一次，进程还可能重启，所以靠 `notification_log` 的
`UNIQUE (family_id, date, meal_slot)` 抢锁 —— 插得进去才算"这一顿还没提醒过"。

**service worker 换成自己写的**（`frontend/src/sw.js`，vite-plugin-pwa 的
`injectManifest` 模式）：自动生成的 SW 没法插 `push` / `notificationclick` 处理。
缓存策略照搬过去了，注释也在那边。

```
push_subscriptions   user_id, endpoint(唯一), p256dh, auth, user_agent, last_sent_at
notification_log     family_id, date, meal_slot —— UNIQUE，用来去重
app_settings         key/value —— 目前只放自动生成的 VAPID 密钥
```

### 21. 用 Portainer 部署

`docker-compose.yml` 里有两处依赖"宿主机上有源码"：`build: context: .`
和相对路径挂载 `./server/src/schema.sql`。Portainer 的 Stack 有两种模式，
差别就在这里。

**先说一件事：别把本机 build 的镜像搬过去。** Docker Desktop（Apple Silicon）
出来的是 `linux/arm64`，x86_64 的服务器跑不了。要么在目标机上 build，
要么用 buildx 出 amd64 推到 registry。

#### 如果你的 Docker 是 Swarm 模式

Portainer 在 Swarm 模式下的 Stack 走的是 `docker stack deploy`，**会忽略 compose 里的一批键**，
所以别直接用 `docker-compose.yml`，用 `docker-stack.yml`：

| compose | swarm |
|---|---|
| `build:` | 忽略 → 先建好镜像，用 `API_IMAGE` 指定 |
| `depends_on: service_healthy` | 忽略 → 应用启动时会重试等数据库（见 `waitForDatabase`） |
| `restart: unless-stopped` | 忽略 → `deploy.restart_policy` |
| `ports: "127.0.0.1:8080:3000"` | 不支持限制到 127.0.0.1，见 `docker-stack.yml` 里的 ⚠️ |

`docker-stack.yml` 用 `docker stack config -c docker-stack.yml` 校验过。

#### 方式 A：Repository 类型 Stack（推荐）

Portainer 自己把仓库 clone 到宿主机，然后在那个目录里跑 compose ——
源码在，所以 `build` 和相对路径挂载都正常，直接用 `docker-compose.yml`。

```
Portainer → Stacks → Add stack → Repository
  Repository URL     你的仓库地址
  Compose path       docker-compose.yml
  Environment variables 里填 POSTGRES_PASSWORD / JWT_SECRET / ADMIN_EMAIL
```

好处是以后更新代码只要点 "Pull and redeploy"。
注意 `.env` 没有提交进仓库，所以环境变量要在 Portainer 界面上填
（作用等同于 `.env`）。

#### 方式 B：Web editor / Upload 类型 Stack

这种模式宿主机上没有源码，`build` 用不了，得先有镜像。用
`docker-compose.portainer.yml` 这个变体：

```bash
# 1. 在**目标机器**上 build 一次（或者从 registry 拉）
git clone <仓库> /srv/meal-planner-src && cd /srv/meal-planner-src
docker build -t meal-planner-api:1.0 .

# 2. schema.sql 放到宿主机上（从零建库时 postgres 要用它）
mkdir -p /srv/meal-planner && cp server/src/schema.sql /srv/meal-planner/

# 3. Portainer 里贴 docker-compose.portainer.yml 的内容，环境变量填：
#    POSTGRES_PASSWORD / JWT_SECRET / ADMIN_EMAIL
#    API_IMAGE=meal-planner-api:1.0
#    SCHEMA_SQL_PATH=/srv/meal-planner/schema.sql
```

如果你是**恢复 dump**（dump 里自带建表语句），第 2 步可以跳过，
把那一行挂载删掉就行。

想用 registry 而不是本地标签：

```bash
docker buildx build --platform linux/amd64 -t ghcr.io/<你>/meal-planner-api:1.0 --push .
# 然后 API_IMAGE=ghcr.io/<你>/meal-planner-api:1.0
```

### 22. 备份

```bash
./scripts/backup.sh /mnt/backup          # 数据库 + 图片
KEEP=14 ./scripts/backup.sh /mnt/backup  # 只留最近 14 份（默认 30）

# crontab：每天凌晨 3 点
0 3 * * * cd /path/to/meal-planner && ./scripts/backup.sh /mnt/backup >> /var/log/meal-backup.log 2>&1
```

**不要直接拷 pgdata 目录当备份。** Postgres 在跑的时候数据分散在很多文件加 WAL 里，
`tar` / `rsync` 拿到的是撕裂快照，可能根本恢复不了 —— 而且你不会知道，
直到真的要用的那天。所以脚本用 `pg_dump`：一致、能恢复、跨架构可移植，
而且小得多（这个库：pgdata 63 MB vs dump 压缩后 8 KB）。

脚本跑完会自检：gzip 完整性 + 数出至少 10 条 `CREATE TABLE`，不满足就非零退出
（cron 里能被发现）。

恢复：

```bash
gzip -dc /mnt/backup/db-20260821-030000.sql.gz   | docker compose exec -T postgres psql -U mealplanner -d mealplanner
```

#### 数据到底该放命名卷还是本地路径

| | 命名卷（默认） | 本地路径 bind mount |
|---|---|---|
| 权限 | Docker 管，不容易手滑 | 要自己保证属主是容器里的 postgres |
| 放宽权限 | — | Postgres 只接受 0700/0750，宽了**直接拒绝启动** |
| 误暴露 | 难 | 路径可能落进 web 根目录、别的备份、甚至 git 仓库 |
| SELinux | 无感 | 要 `:Z`，容易被人用"关掉 SELinux"糊过去 |

建议：**pgdata 留命名卷**（备份靠 `pg_dump`，不需要能直接看到文件）；
**uploads 用本地路径挺好** —— 就是些图片文件，没有一致性问题，rsync 很方便：

```yaml
  api:
    volumes:
      - /srv/meal-planner/uploads:/app/uploads
```

**备份文件本身是敏感的**：里面有 bcrypt 密码哈希、邮箱地址、以及推送用的
VAPID 私钥。脚本已经把目录设成 700、文件设成 600；要传到别处请先加密。

### 23. 迁移到别的服务器

导出（在**旧**机器上）：

```bash
./scripts/backup.sh /tmp/migration          # db-*.sql.gz + uploads-*.tar.gz
```

或者用一次性的完整 dump（迁移场景更直观，文件名固定）：

```bash
mkdir -p /tmp/migration
docker compose exec -T postgres pg_dump -U mealplanner -d mealplanner \
  --no-owner --no-privileges --clean --if-exists > /tmp/migration/mealplanner.sql
docker run --rm -v meal-planner_uploads:/from -v /tmp/migration:/to alpine \
  tar czf /to/uploads.tar.gz -C /from .
cp scripts/restore.sh /tmp/migration/
```

恢复（在**新**机器上，服务已经部署起来之后）：

```bash
./scripts/restore.sh /path/to/migration           # 先看计划，输 yes
./scripts/restore.sh /path/to/migration -y        # 跳过确认
./scripts/restore.sh /path/to/migration -y --force  # 目标库已有数据也覆盖
```

图片有三种恢复方式（**bind mount 也能用**）：

```bash
# 默认：自动找 *_uploads 卷
./scripts/restore.sh /path/to/migration

# bind mount：直接解到本地目录
UPLOADS_PATH=/srv/meal-planner/uploads ./scripts/restore.sh /path/to/migration

# 只要数据库，图片自己解
./scripts/restore.sh /path/to/migration --skip-uploads
```

什么都不指定、又没找到 `*_uploads` 卷时，**数据库照样恢复**，最后把图片的解压命令
打给你 —— 不会因为图片这一步把整个恢复拦下来。

`restore.sh` **只用 `docker` 命令**，compose 和 swarm 都能跑：它按名字找在跑的
postgres 容器（swarm 是 `<stack>_postgres.1.xxx`，compose 是 `<项目>-postgres-1`），
按 `*_uploads` 找卷，都能用 `PG_CONTAINER=` / `UPLOADS_VOLUME=` 覆盖。

两道保险：不加 `-y` 会先打印计划等你确认；目标库里已经有用户时直接拒绝，
要覆盖得显式 `--force`。

**不要直接拷 pgdata 目录搬过去** —— 那是平台相关的物理格式。这个 demo 的数据目录是
aarch64 + musl 写的，搬到 x86_64 上可能起不来，或者"能起来但索引排序悄悄不对"。
SQL dump 是纯文本，跨架构安全。

### 24. 排错：sharp 报 `Cannot read properties of undefined (reading 'endsWith')`

```
/app/node_modules/sharp/dist/sharp.mjs:115
    if (!err.code.endsWith("MODULE_NOT_FOUND")) {
TypeError: Cannot read properties of undefined (reading 'endsWith')
```

**这不是 sharp 的 bug 在报什么有用的东西** —— 它是 sharp 加载原生库失败之后，
错误处理自己又崩了：它假设每个失败都带 `err.code`，而真正的加载失败（架构不对、
libc 不对）没有这个字段，于是报了个毫无关联的 TypeError，把真正的原因盖住了。

**真正的原因几乎总是：镜像里的 sharp 原生库和运行平台不匹配。** 最常见的是
在 Apple Silicon 上 build（arm64）然后跑在 x86_64 服务器上。

#### 为什么报的是这个错

看一眼 sharp 自己的代码（`sharp.mjs`，0.35.3）：

```js
errors.forEach((err) => {
  if (!err.code.endsWith("MODULE_NOT_FOUND")) {   // err.code 可能是 undefined
```

它把每次加载失败都收进 `errors`，最后拼提示信息时假设**每个错误都有 `.code`**。
动态库加载失败（比如把 glibc 编的库加载到 musl 上）抛出来的错误没有 `.code`，
于是这一行自己崩了，把真正的 "Could not load the sharp module" 整段盖掉。

所以：**报 TypeError 不代表缺包，代表找到了但加载不起来**。
真的缺包时报的是另一句（`Cannot find package '@img/colour'`
或 `Ensure optional dependencies can be installed`）。

#### 先看真正的错误

api 容器如果在反复重启，`docker exec` 进不去，用覆盖 entrypoint 的方式跑：

```bash
docker run --rm --entrypoint sh <你的镜像> -c '
  uname -m
  node -p "process.platform + \" \" + process.arch"
  ls /lib/ld-musl* >/dev/null 2>&1 && echo musl || echo glibc
  echo "--- 装了哪些平台包 ---"
  ls /app/node_modules/@img/
  echo "--- 直接加载 binding，看真正的报错 ---"
  node -e "require(\"@img/sharp-linuxmusl-x64\")" 2>&1 | head -3
'
```

对照表 —— Alpine 基础镜像（musl）上应该看到：

| 服务器 | `uname -m` | 必须有的包 |
|---|---|---|
| x86_64 | `x86_64` | `sharp-linuxmusl-x64` + `sharp-libvips-linuxmusl-x64` |
| arm64 | `aarch64` | `sharp-linuxmusl-arm64` + `sharp-libvips-linuxmusl-arm64` |

看到的是 `arm64` 包却跑在 `x86_64` 上 —— 就是镜像建错了平台。

#### 已经在目标机器上重建过、还是不行？

那就不是平台建错了，而是**装上的 binding 和运行环境的 libc 不匹配** ——
最常见的是 Alpine（musl）上装到了 glibc 版的包。绕过 sharp 那个坏掉的错误处理，
直接加载 `.node` 文件，才能看到真正的原因：

```bash
docker run --rm --entrypoint sh <你的镜像> -c '
  ls /app/node_modules/@img/
  find /app/node_modules/@img -name "*.node"
  node -e "require(\"/app/node_modules/@img/sharp-linuxmusl-x64/lib/sharp-linuxmusl-x64-0.35.3.node\")"
'
```

真正的报错里出现什么，对应什么问题：

| 关键词 | 说明 |
|---|---|
| `Error relocating` / `symbol not found` | glibc 的包跑在 musl 上（或反过来） |
| `Error loading shared library ld-linux-x86-64.so.2` | 同上，glibc 的库在 Alpine 上 |
| `wrong ELF class` / `Exec format error` | 架构不对（arm64 vs x64） |
| 只有 `sharp-linux-x64`、没有 `sharp-linuxmusl-x64` | npm 没按 libc 选包（npm 太旧） |

npm 没按 libc 选包时，显式指定平台重装：

```bash
npm install --include=optional --os=linux --cpu=x64 --libc=musl sharp
```

Dockerfile 里已经加了两道防线：`npm ci --omit=dev --include=optional`（防止
optional 被跳过），以及**构建时就 `require('sharp')` 一次** —— 平台不匹配的话
在 build 阶段就失败，而不是部署完容器反复重启才发现。arm64 和 amd64 都验证过能通过。

#### 最可能的原因：CPU 太老（x86-64-v2）

看 sharp 自己的代码（`sharp.cjs`）：

```js
if (sharp && ["linux-x64","linuxmusl-x64"].includes(runtimePlatform) && !sharp._isUsingX64V2()) {
  const err = new Error("Prebuilt binaries for Linux x64 require v2 microarchitecture");
  errors.push(err);
  sharp = null;          // 把已经加载成功的 binding 主动扔掉
}
```

**sharp >= 0.33 的 Linux x64 预编译库要求 x86-64-v2 微架构**
（需要 SSE4.2 / POPCNT / SSSE3 / SSE4.1 / CX16）。很多 NAS、老服务器上的
Atom / 老 Celeron 达不到。这时候 binding **能加载**，是 sharp 自己拒绝用它 ——
所以 `sharp-doctor` 会显示 `OK sharp-linux-x64` 但 `require("sharp")` 还是失败。

**虚拟机里最常见的其实不是"CPU 老"，而是虚拟机把 CPU 特性屏蔽了。**
Proxmox 新建 VM 的默认 CPU type 是 `kvm64` —— 一个非常保守的型号，
**不暴露 SSE4.2**。宿主机是再新的 Xeon 也一样，guest 里就是看不到，
于是 sharp 的 v2 检查必然不过。

在**虚拟机内部**一条命令确认：

```bash
grep -m1 -o -E 'sse4_2' /proc/cpuinfo || echo '缺 sse4_2 -> 不满足 x86-64-v2'
lscpu | grep -i 'model name'
```

`model name` 显示 `Common KVM processor` / `QEMU Virtual CPU` 这类，
就是被虚拟机屏蔽了。

**解法 A（Proxmox / KVM 虚拟机，推荐）**：把 VM 的 CPU type 从 `kvm64` 改掉。

```
Proxmox 界面： VM -> Hardware -> Processor -> Type
  host              直接透传宿主机 CPU，性能最好
  x86-64-v2-AES     想保留跨机器迁移能力时用这个
```

改完要**完整关机再开机**（reboot 不生效，CPU 型号只在开机时确定）。
顺带一提：`kvm64` 还屏蔽了 AES-NI、AVX 等，换掉之后整台机器都会快一些。

注意：`host` 会让 VM 绑死在当前宿主机的 CPU 上，集群里做在线迁移会有问题 ——
有集群就选 `x86-64-v2-AES` 或某个具体型号。

**解法 B：sharp 钉在 0.32.x**（本仓库当前采用，改不了虚拟机配置时用）。
0.33 才引入这个 CPU 检查，0.32.6 没有：

```json
"sharp": "^0.32.6"
```

代价是 libvips 版本旧一些（8.14.5 vs 8.18.3），本项目用到的 API
（`rotate` / `resize` / `jpeg` / `clone` / `failOn`）0.32 全都有，行为一致 ——
已验证：amd64 上跑通完整上传管线，主图 1233x1600、缩略图 308x400，和之前一样。

按解法 A 修好虚拟机之后，就可以把 sharp 改回 `^0.35.3` 用新版 libvips 了
（`server/package.json` 里改一行，然后在目标机器上重建 —— 构建时的自检会立刻
告诉你行不行）。

#### 让构建自己把真正的原因打出来

sharp 报的 TypeError 没有任何信息量。`server/scripts/sharp-doctor.cjs` 绕过
sharp 那个坏掉的错误处理，逐个直接 `require` binding，把真正的 `code` / `msg` /
`ldd` 打出来。Dockerfile 里已经接上：**sharp 加载失败时自动跑它**，
所以构建日志里就有答案，不用再手工进容器。

也可以单独跑：

```bash
docker run --rm --entrypoint node <你的镜像> /app/scripts/sharp-doctor.cjs
```

输出长这样（这是一台**正常**的机器，注意 musl 那条 FAIL 是正常的 ——
glibc 容器里本来就加载不了 musl 版，只要有一个 OK 就行）：

```
=== 环境 ===
node         v20.20.2 linux arm64
libc         ldd (Debian GLIBC 2.31-13+deb11u13) 2.31
kernel       7.0.12-linuxkit

=== 逐个直接加载 binding（真正的报错在这里）===
  OK    sharp-linux-arm64/sharp-linux-arm64-0.35.3.node
  FAIL  sharp-linuxmusl-arm64/...node
        code = ERR_DLOPEN_FAILED
        msg  = libc.musl-aarch64.so.1: cannot open shared object file
```

**全部 FAIL 才是真出问题**（sharp 只要有一个能加载就正常）。这时看每条的
`code` / `msg` / `ldd`：

| 看到 | 说明 |
|---|---|
| `Error relocating` / `symbol not found` | libc 版本不匹配 |
| `wrong ELF class` / `Exec format error` | 架构不对 |
| `cannot open shared object file` + `ldd ... not found` | 缺依赖库 |
| `GLIBC_2.xx not found` | 容器 glibc 太老，配不上预编译库 |
| 报 `Operation not permitted` 之类 | 很可能是 seccomp（见下） |

#### 老服务器上可能撞到：clone3 / seccomp

**症状**：新机器上一切正常，某台老服务器上无论怎么重建都报那个 TypeError。

**原因**：glibc >= 2.34 会用 `clone3` 系统调用，而 **Docker < 20.10.10 的默认
seccomp 配置把它挡掉了**。libvips 重度用线程，原生库初始化直接失败；
这个失败抛出的错误没有 `.code`，正好踩中 sharp 那个坏掉的错误处理，
于是报出来是一句和真实原因毫无关系的 TypeError。

**怎么确认是这个**（一条命令）：

```bash
# 宿主机的 glibc / Docker 版本
ldd --version | head -1     # 2.28 -> Debian 10，Docker 大概是 19.03
docker --version

# 关掉 seccomp 再加载一次 sharp；如果这样就成功了，那就是它
docker run --rm --security-opt seccomp=unconfined --entrypoint node <你的镜像> \
  -e "require('sharp'); console.log('seccomp 放开后 OK')"
```

**解法**（本仓库已采用第 2 个）：

1. 服务器上把 Docker 升到 >= 20.10.10（根治）
2. **基础镜像用 glibc < 2.34 的**：`node:20-bullseye-slim`（Debian 11，glibc 2.31）
   —— 不用 clone3，老 Docker 也能跑。sharp 预编译库要求 glibc >= 2.28，2.31 满足
3. 临时应急：跑的时候加 `--security-opt seccomp=unconfined`（削弱隔离，不推荐长期用）

| 基础镜像 | glibc | 老 Docker(<20.10.10) |
|---|---|---|
| `node:20-slim`（bookworm） | 2.36 | ✗ 挂 |
| `node:20-bullseye-slim` | 2.31 | ✓ 可以 |

Docker 升级之后可以换回 `node:20-slim`。

#### 为什么不用 Alpine

sharp 的原生库按 **(架构, libc)** 两个维度分别预编译。Alpine 用的 musl 是第二个维度，
也是问题高发的那一边：包装上了、架构也对，照样可能加载不起来，
而 sharp 报出来的还是那个看不懂的 TypeError。

所以 `Dockerfile` 的基础镜像从 `node:20-alpine` 换成了 `node:20-slim`（Debian，glibc）。
glibc 是 sharp 支持得最好的一条路，直接少掉一整类事故。
代价是镜像大几十 MB —— 对这个应用来说，稳定比省空间重要。

已验证：`--platform linux/amd64` 建出来的 slim 镜像里 sharp 能正常加载
（`sharp ok, libvips 8.18.3 x64 linux`），并且真的跑通了一次缩放。

#### 修

**在目标机器上重新 build**（最省事）：

```bash
docker build -t meal-planner-api:1.0 .
```

**或者用 buildx 出 amd64 再推到 registry**（在 Mac 上做）：

```bash
docker buildx build --platform linux/amd64 -t <registry>/meal-planner-api:1.0 --push .
```

这个 Dockerfile 已经验证过：`--platform linux/amd64` 建出来的镜像里是
`sharp-linuxmusl-x64`，sharp 能正常加载。所以不用改 Dockerfile，
只要 build 的平台对就行。

> 顺带一句：`docker save` / `docker load` 搬镜像**不解决**这个问题 ——
> 搬过去的还是 arm64 的那份。

### 26. 可选食材

香菜、辣椒、装饰用的白芝麻 —— 有更好，没有也能做。在食材行左边点一下那个圈就标成可选。

购物清单里**单独成行**，不混进必买的量：

```
土豆  1000 g          <- 必买（两道菜加起来）
土豆   200 g  可选     <- 可有可无，在超市自己决定
香菜    20 g  可选
```

为什么不合成一行：合成 1200 g 之后，你在超市就不知道哪 200 g 是可省的了。
分开还有个好处 —— 两行各自能勾，买了必买的、跳过可选的，进度照样是对的。

一道菜只填了可选食材（等于没填），生成清单时仍然会提醒你"这道菜没有食材"。

### 27. 主食（米饭 / 面条 / 意面）

中式吃法里主食几乎每顿都有，但它**不是一道菜**，算量的方式完全不同：

```
菜    一份够 4 人，整份做   ->  ceil(顿数 x 人数 / 4)   多的放冰箱
主食  每人 75 g 生米，线性  ->  75 x 人数 x 顿数        没有"整份"的概念
```

所以主食单独一套数据（`staples` 表），不塞进菜品库。

**默认 + 例外**，让「今晚又是米饭」这件事一次都不用点：

```
设置 -> 主食：默认 米饭 75 g/人，自动配给 午餐 + 晚餐
   |
   +-> 周一 ~ 周五 午/晚餐   自动跟着默认   （浅色显示）
   +-> 周三晚餐 改成意面     在菜单里改一下  （实色显示）
   +-> 周四晚餐 不要主食     选「不要主食」
   +-> 出去吃 / 还没排菜的格子   不配主食，也不进购物清单
```

`menu_staples` 表**只存例外**。所以以后把默认从米饭换成面条，整周自动跟着变，
不用一顿一顿去回填。哪几顿自动配主食也能改（默认午餐+晚餐）。

购物清单里主食和食材走同一套单位合并：菜谱里也有「意面 150 g」的话，会和主食的意面加在一起。

> 如果你之前用「建一道叫『白米饭』的菜」来凑，现在可以把那道菜删掉了 —— 否则大米会被算两遍。

### 28. 步骤拖动排序

做法步骤左边有个把手，按住拖就能换顺序，手指越过相邻那一步的中线就交换。

用的是 Pointer Events，不是 HTML5 的 drag-and-drop —— 后者在手机上根本不触发，
而这个应用主要就是在厨房里拿手机看的。把手上加了 `touch-action: none`，
否则手机上一拖就变成页面滚动。

把手下面还有上/下箭头：键盘和读屏用户没法拖，小屏上精细拖动也别扭。

### 29. 用 AI 把菜谱填进来

手工敲食材和步骤挺费劲。菜谱表单顶上有「用 AI 帮我填」：贴一段菜谱文字，或者给一个网址，
模型解析出来直接填进表单，**你改完再自己按保存**。

有三种方式，都是**只预填、不落库**：

| 方式 | 要不要配 key | 怎么用 |
|---|---|---|
| **贴 JSON** | **不要** | 复制提示词 -> 拿去问任何一个聊天窗口 -> 把 JSON 贴回来 |
| 贴文字 | 要 | 把菜谱原文贴进来，服务端直接调模型 |
| 给网址 | 要 | 给一个菜谱网址，服务端抓下来再调模型 |

**「贴 JSON」不需要任何配置**，所以这个面板永远都在。它用的是你已有的订阅
（Claude.ai、ChatGPT、本地模型都行），不用再申请 API key、也不多花钱：

```
面板里点「复制提示词」
  -> 粘到聊天窗口，后面接上菜谱原文
  -> 把返回的 JSON 整段贴回输入框
  -> 点「解析并填进表单」
```

提示词是服务端 `GET /api/recipes/import/prompt` 给的，和真正调模型时用的
**同一份 schema**（`buildPastePrompt()` 复用 `SYSTEM_PROMPT` + `RECIPE_JSON_SCHEMA`）。
两边分开维护的话，用户贴回来的 JSON 迟早和我们期望的形状对不上。

贴回来的内容不用手工清理：带 ``` 围栏、前后还有「好的，这是结果：」之类的废话都能认，
挖 JSON 用的是同一个 `extractJson()`。

> 注意：复制按钮依赖 `navigator.clipboard`，它只在 https / localhost 下存在。
> 从局域网 IP 用明文 http 打开时会自动退化成「把提示词摊开、你自己全选复制」。

想让服务端直接调模型（贴文字 / 给网址），再配 key：

```bash
# .env —— 用 Anthropic
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-5        # 可省，默认就是它

# 或者任何 OpenAI 兼容的接口（本地 Ollama / vLLM / LM Studio 都行）
LLM_PROVIDER=openai
LLM_API_KEY=whatever             # 本地服务随便填个非空值
LLM_BASE_URL=http://ollama:11434/v1
LLM_MODEL=qwen2.5:14b
```

改完 `docker compose up -d api`。没配 `LLM_API_KEY` 的话整个面板不显示，其它功能一点不受影响。

**几个刻意的设计**：

- **只预填，不落库。** 模型会看错、会漏、会把 1 cup 换错。解析结果只是填进表单的草稿。
- **三种方式共用一条清洗管道。** 「贴 JSON」进来的内容和模型直接返回的一样不可信
  （毕竟也是模型写的），所以走的是同一个 `normalizeRecipeDraft()`，
  一个字段都不会绕过校验。
- **输出一律清洗一遍。** 模型返回的分类 / 单位 / 数量都不可信，服务端按自己的枚举
  再过一遍：不认识的分类落到默认值，负数归零，`isOptional` 只认真正的布尔 `true`，
  食材上限 60 条、步骤 40 步。原文标了「optional / facultatif」的会自动标成可选食材。
- **抓网址是 SSRF 高危动作**，所以每一跳都查：只允许 http/https；域名解析出来的 IP
  不能是内网 / 环回 / 链路本地（`169.254.169.254` 那个云元数据地址尤其要拦）；
  重定向手动跟（fetch 自动跟的话第二跳就绕过检查了）；12 秒超时、2 MB 上限。

  IPv6 那边要特别小心：URL 解析器会把 `http://[::ffff:127.0.0.1]` 规范化成
  `::ffff:7f00:1`，看着完全不像本机地址。所以判断是把 IPv6 展开成 8 组、
  把嵌在里面的 IPv4 抠出来再判，不靠字符串前缀。
- **限流**：同一个人 3 秒一次、一小时 40 次 —— 调用是要花钱的。

抓不到内容（需要登录、纯图片站）会直接告诉你「试试直接把菜谱贴进来」。

### 30. 为什么没有早餐

每周计划只有 **午餐 + 晚餐**。早饭各人各吃、每天差不多，排进计划纯属给自己添活。

餐次是一处定义、两边引用：

```
server/src/recommend.js      export const MEAL_SLOTS = ['午餐', '晚餐']   <- 后端权威
frontend/src/lib/constants.js export const MEAL_SLOTS = ['午餐', '晚餐']  <- 前端跟着它
```

菜单骨架、备餐份数、购物清单、主食、做饭提醒、餐次时间设置全都从这里推导，
所以以后想加回早餐（或者加个夜宵），改这两行 + 补一条迁移就行。

四个写入接口都会拒掉不在列表里的餐次：`PATCH /api/menu/slot`、
`PATCH /api/menu/staple`、`PATCH /api/staples/settings`、`PATCH /api/family`（餐次时间）。

**已归档的历史不受影响。** 迁移 012 只清「还没确认」的周；确认过的周原样留着，
历史页显示的餐次名是跟着数据走的，不依赖 `MEAL_SLOTS`，
所以老库里真有早餐记录也照样显示得出来。

顺带一个坑：菜谱上的 `meals` 数组去掉早餐之后可能变成空数组，
那样这道菜既不会被自动排菜选中、也没法手动加进任何一格 —— 等于悄悄消失。
迁移里把空的兜底成 `{午餐,晚餐}`。

### 31. 记账

日常开销记一笔就完事：金额、日期、分类、备注。金额支持 `12.50` 和 `12,50` 两种写法
（法语键盘打出来是逗号）。

**子账本**是这个功能的重点。去意大利待两周，开一个子账本，那两周的花销都记进去：

```
主账本（= 这个家庭）
├── 日常              ← ledger_id 为空的开销
├── 2026 夏 意大利两周  ← 子账本
└── 阳台改造           ← 子账本
```

关键在于**子账本不是独立的钱袋子**：`expenses.ledger_id` 只是个归属标记，
总账永远是全部开销之和。所以两个问题都能答得对：

| 问题 | 看哪里 |
|---|---|
| 这次度假一共花了多少 | 那个子账本的合计（不受当前月份筛选影响） |
| 这个月一共花了多少 | 总账 —— 度假的钱**也算在里面** |

要是把子账本做成独立账本，第二个问题就永远答不对了。

子账本可以**归档**（度假结束了但记录要留着），也可以删。删的时候里面的开销
**不会跟着消失**，只是回到「日常」—— 花出去的钱是事实，不该因为整理账本而蒸发
（`ON DELETE SET NULL`）。

**多货币从不换算。** 在瑞士花的 CHF 和家里的 EUR 是两笔账，汇率天天变、
我们手上也没有可信汇率源，编一个只会让账变成假的。所有合计按货币分组，
显示成 `€501.50 + CHF 120.00`。日元这类没有小数位的货币也认（`money.js`）。

### 32. 卡包（会员卡）

超市积分卡、药店卡这些，实体卡上就是一串码。存下来，结账时点一下全屏放大。

**结账台那几秒决定这个功能有没有用**，所以全屏视图是这么做的：

```
纯白底 + 纯黑码      扫码枪靠反差识别，用主题色只会降低成功率
一维码可以横过来      转 90 度，长度能翻一倍多（手机大多锁竖屏，所以给了手动按钮）
Wake Lock 顶住屏幕    不然读到一半黑屏
实拍照片兜底          码印糊了扫不出来，直接把照片给收银员看
```

支持 Code 128 / EAN-13 / EAN-8 / UPC-A / Code 39 / ITF / QR。全在浏览器里画
（`jsbarcode` + `qrcode`），所以**没网也能调出来**——装成 App 之后照样能用。

EAN-13 / EAN-8 / UPC 的最后一位是校验位，**会验**：

```
4006381333931  ✓
4006381333930  ✗  EAN-13 校验位不对（最后一位应该是 1）
```

故意只报错、不自动改用户输入 —— 悄悄改掉一位数字比报错更糟。验不过又确实要存的，
改用 Code 128（它什么 ASCII 字符都能编，不做校验）。

> 会员卡号能识别到人，也有被拿去刷积分的可能。它存在你自己的服务器上、
> 只有同一个家庭的成员能看到，但备份文件里是明文 —— 备份别乱放（见第 22 节）。

### 33. 设置页怎么分的

设置按**功能域**分组，分组名和底部 tab 一一对应，找设置不用猜：

```
账号        显示名称、密码                     只跟你自己有关
吃饭        主食、做饭提醒、餐次时间           <- 对应「吃饭」tab
记账        默认货币                           <- 对应「记账」tab
卡包        卡片顺序、是否自动横屏             <- 对应「卡包」tab
家庭        名称、人数、邀请码、成员、时区
应用管理    用户审核                           只有管理员看得到
```

**哪些设置存数据库、哪些只存这台设备**，判断标准是「换一台设备还该不该跟着走」：

| 存哪 | 例子 |
|---|---|
| 数据库（跟家庭走） | 家里几口人、默认货币、默认主食、做饭提醒、卡片顺序 |
| localStorage（跟设备走） | 界面语言、打开卡片时是否自动横屏 |

手上这台手机横过来顺手，平板未必；语言也是各人各的。这类偏好跟着账号走反而讨嫌
（见 `frontend/src/lib/devicePrefs.js`）。

### 34. 跑测试

后端的纯函数都有测试，不需要数据库、不需要起服务：

```bash
cd server && npm test
```

覆盖的是那些「算错了不会报错、只会悄悄给出错数字」的地方 ——
金额和货币合计、EAN/UPC 校验位、主食的默认与例外、可选食材的分行，
以及模型输出清洗和 SSRF 拦截（内网地址、IPv6 里嵌的 IPv4 那些绕法）。

### 25. 配置你的 nginx

参考项目里的 `nginx-example.conf`，核心是把 `meal.xxx.fr` 反向代理到
`127.0.0.1:8080`。记得转发 `X-Forwarded-Proto` 这个头，后端要靠它判断
请求是不是走 https（cookie 的 secure 标志依赖这个）。

```bash
sudo cp nginx-example.conf /etc/nginx/sites-available/meal.xxx.fr
sudo ln -s /etc/nginx/sites-available/meal.xxx.fr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

如果还没配 https，跑一下 `certbot --nginx -d meal.xxx.fr`（假设你用 certbot）
会自动加证书和跳转配置。

打开 `https://meal.xxx.fr`，应该能看到登录页了。

## 二、本地开发（不经过 Docker）

需要本地装好 Node.js 18+ 和 Postgres。

```bash
# 1. 建本地数据库
createdb mealplanner
psql -d mealplanner -f server/src/schema.sql

# 2. 起后端
cd server
cp .env.example .env   # 按需改一下连接串
npm install
npm run dev             # nodemon，监听 3000 端口

# 3. 起前端（另开一个终端）
cd frontend
npm install
npm run dev              # 监听 5173，自动把 /api 和 /uploads 代理到 3000
```

打开 `http://localhost:5173` 就能用了。

## 三、目录结构

```
meal-planner/
├── docker-compose.yml       服务编排：postgres + api
├── Dockerfile               多阶段构建：编译前端 + 打包后端
├── docker-compose.portainer.yml  Portainer Web editor 用的变体（用现成镜像）
├── docker-stack.yml         Docker Swarm 用的 stack 文件
├── scripts/
│   ├── backup.sh            备份：pg_dump + 图片打包，自带校验和保留策略
│   └── restore.sh           恢复/迁移：只用 docker 命令，compose 和 swarm 都能跑
├── nginx-example.conf       给你宿主机 nginx 参考的反向代理配置
├── .env.example             docker compose 用的环境变量
├── server/                  后端
│   ├── src/
│   │   ├── index.js         Express 入口，托管 API + 前端静态文件 + 图片
│   │   ├── db.js            Postgres 连接池
│   │   ├── auth.js          JWT 签发/校验 + 权限中间件（登录/管理员/家庭）
│   │   ├── schema.sql       数据库表结构（新库一次建成最新结构）
│   │   ├── migrate.js       极简迁移：给已经存在的库补上缺的列
│   │   ├── adminBootstrap.js 第一个管理员从哪来（ADMIN_EMAIL / 第一个注册的人）
│   │   ├── userStatus.js    账号审核状态 + 提示文案
│   │   ├── validate.js      注册和 URL 参数的校验
│   │   ├── imageProcessor.js 上传图片压缩：主图 1600px + 缩略图 400px
│   │   ├── units.js         单位表 + 换算（哪些单位能相加）
│   │   ├── shoppingAggregate.js 购物清单汇总（合并同类单位 + 按份数放大）
│   │   ├── portions.js      份数换算：一道菜这一周要做几份（买现成的算"买几个"）
│   │   ├── staples.js      主食：默认+例外的解析、按人按顺算总量
│   │   ├── money.js        金额解析/合计（**不同货币绝不相加**）
│   │   ├── cardFormats.js  条码格式 + EAN/UPC 校验位验证
│   │   ├── inviteCode.js    家庭邀请码生成（去掉易混字符）
│   │   ├── historyStats.js  历史汇总统计（纯函数）
│   │   ├── weekDays.js      一周 7 天 x 每天午/晚两餐的骨架
│   │   ├── recommend.js     每周菜谱推荐算法（纯函数）
│   │   └── routes/
│   │       ├── auth.js      注册/登录/建家庭/加入家庭
│   │       ├── admin.js     管理员后台：审核账号、设管理员、删账号
│   │       ├── units.js     给表单下拉框用的单位列表
│   │       ├── family.js    家庭管理：改名/邀请码/成员/转让/退出
│   │       ├── history.js   过去几周吃了什么（逐餐记录 + 汇总）
│   │       ├── recipes.js   菜品库 CRUD + 图片上传
│   │       ├── menu.js      本周菜谱：查询/生成/手动调整/改某顿的主食
│   │       ├── staples.js   主食清单 CRUD + 默认主食设置
│   │       ├── cards.js     会员卡 CRUD
│   │       ├── ledgers.js   子账本 CRUD + 总览汇总
│   │       ├── expenses.js  开销条目 CRUD + 筛选
│   │       ├── recipeImport.js 从文字/网址解析菜谱草稿（限流在这里）
│   │       └── shopping.js  购物清单：查询/生成/勾选
│   ├── test/                后端纯函数测试（node test/run.mjs，不依赖数据库）
│   │   ├── money.test.mjs        金额解析、按货币分组合计
│   │   ├── cardFormats.test.mjs  EAN/UPC 校验位、各码格式校验
│   │   ├── staples.test.mjs      主食默认+例外、可选食材分行
│   │   └── llm.test.mjs          模型输出清洗、SSRF 拦截
│   └── .env.example         本地开发用的环境变量
└── frontend/                前端（React + Vite + Tailwind）
    ├── src/
    │   ├── lib/
    │   │   ├── api.js              统一的 fetch 封装（带 cookie）
    │   │   ├── poll.js             轮询封装（窗口重新获得焦点时立刻刷新）
    │   │   ├── familyData.js       菜谱/菜单/购物清单的读写
    │   │   ├── adminData.js        管理员后台的接口调用
    │   │   ├── offlineQueue.js     购物清单离线写队列
    │   │   └── constants.js        餐次/星期等共享常量
    │   ├── i18n/                    多语言：词典 + t() + 数据值显示名
    │   ├── context/AuthContext.jsx 登录状态 + 是否管理员
    │   ├── components/             导航栏、计时器、照片上传、路由守卫等
    │   └── pages/                  登录、菜品库、菜谱详情、本周菜谱、购物清单、设置、历史
    └── vite.config.js              开发代理配置 + PWA 离线缓存策略
```

## 四、数据库结构

```
families              id, name, invite_code, member_count, owner_id, timezone,
                      meal_times, notify_enabled, notify_lead_minutes,
                      default_staple_id, staple_meals[]
users                 id, email, password_hash, display_name, family_id,
                      status(pending/approved/rejected), is_admin, approved_at, approved_by
recipes               id, family_id, name, category, meals[], time_minutes, servings,
                       is_store_bought, health_score, like_score,
                       tags[], last_cooked_date, photo_url, thumb_url
ingredients            recipe_id, name, amount, unit, category, is_optional
steps                  recipe_id, sort_order, title, content, timer_seconds,
                       photo_url, thumb_url
weekly_menus           id, family_id, week_start, confirmed_at
menu_slots             weekly_menu_id, date, weekday, meal_slot, recipe_id, recipe_name,
                       is_eat_out, like_score, health_score
                       （一格可多行 = 一顿多道菜；recipe_name 是快照，删菜谱也留着）
shopping_lists         id, family_id, week_start
shopping_list_items    shopping_list_id, name, category, qty, unit, is_optional, checked
staples                id, family_id, name, amount_per_person, unit, category, sort_order
                       （主食清单，家庭自己维护）
menu_staples           weekly_menu_id, date, meal_slot, staple_id, staple_name,
                       amount_per_person, unit, category, is_none
                       （**只存例外**：没有行就是跟着 families.default_staple_id 走）
```

## 五、数据备份

自建之后备份是你自己的责任了，两个数据源要备份：

**数据库**（推荐每天跑一次定时任务）：
```bash
docker compose exec postgres pg_dump -U mealplanner mealplanner > backup_$(date +%F).sql
```

**图片**（`uploads` 这个 Docker volume）：
```bash
docker run --rm -v meal-planner_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads_$(date +%F).tar.gz -C /data .
```
（volume 名字前缀是你项目目录名，实际名字用 `docker volume ls` 确认一下）

可以写个 cron job 每天跑这两条命令，再把生成的文件同步到别的地方（比如你自己的
NAS 或者一个便宜的对象存储），这样即使服务器本身出问题也不会丢数据。

## 六、安全说明

- 密码用 bcrypt 加盐哈希存储，不是明文
- JWT 放在 httpOnly cookie 里，前端 JS 读不到，减少 XSS 窃取 token 的风险
- 每个 API 请求都会校验"这条数据是不是属于当前用户的家庭"，一个家庭看不到另一个
  家庭的数据（后端测试过这一点）
- `COOKIE_SECURE=true` 意味着 cookie 只在 https 下发送，所以生产环境一定要配好
  https（nginx + certbot），本地开发用 `COOKIE_SECURE=false` 单独配置

## 七、已知的小限制（不影响日常使用，但值得知道）

- 购物清单的离线队列只处理"勾选/取消勾选"这一种操作；如果两个人**同时离线**对
  同一项做了不同次数的勾选，重新联网后可能出现一次性的状态误差（自己再点一下就好，
  这个场景概率很低）
- 没有做"每周自动生成菜谱"的定时任务，需要手动点按钮触发（想加的话可以在服务器上
  配一个 cron job，定时调用 `POST /api/menu/generate`，我可以帮你写）
- 单张图片上传上限 8MB（nginx 和后端都设了这个限制，想改的话两边都要改）

## 八、后续可以加的功能

- WebSocket 真实时同步（替代轮询）
- 每周自动生成菜谱的定时任务
- 菜谱评分、按季节推荐、营养均衡度分析（跟 Firebase 版提到的一样，思路不变，
  只是数据库操作要改成 SQL）

### 让局域网里的手机/电脑直接访问

`.env` 里两个变量要一起改，只改一个会出现"能打开页面但登不上"：

```bash
BIND_ADDR=0.0.0.0       # 8080 绑到所有网卡，不再只给本机
COOKIE_SECURE=false     # 关键：见下
```

然后 `docker compose up -d api`，手机浏览器开 `http://<这台机器的局域网IP>:8080`。

**为什么必须同时把 COOKIE_SECURE 关掉。** `COOKIE_SECURE=true` 时登录 cookie 带
`Secure` 标记，浏览器只肯在 https 下保存它 —— 唯一的例外是 `localhost`。
从 `http://192.168.x.x` 访问时，登录请求会返回 200，但 cookie 被浏览器直接丢掉，
于是下一个请求又是未登录状态，表现就是**"登录成功后一闪又回到登录页"**：

```
http://localhost:8080     Secure cookie -> 浏览器破例保存   -> 登录正常
http://192.168.0.55:8080  Secure cookie -> 浏览器直接丢掉   -> 一直跳回登录页
https://meal.xxx.fr       Secure cookie -> 正常保存         -> 登录正常
```

**明文 http 走局域网还有两个功能用不了**（浏览器要求 secure context，
`localhost` 例外，局域网 IP 不例外）：

| 功能 | http://局域网IP | https 域名 |
|---|---|---|
| 正常浏览、记录菜谱、排菜单 | 可以 | 可以 |
| 登录（要 `COOKIE_SECURE=false`） | 可以 | 可以 |
| 装成 App / 离线缓存（PWA） | **不行** | 可以 |
| 做饭提醒推送（Web Push） | **不行** | 可以 |

所以要手机推送提醒，就得有 https。家里的几种做法：

- **前面挂 nginx + 证书**（本仓库原本的设计）—— `BIND_ADDR` 留 `127.0.0.1`，
  `COOKIE_SECURE=true`，反代到 `127.0.0.1:8080`。
- **Tailscale / WireGuard** —— 手机进同一个虚拟网，Tailscale 还自带 https 域名，
  改都不用改。
- **只在局域网里用、不要推送** —— 上面两个变量一改就行，最省事。
