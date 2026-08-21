# 食谱管家（自建版）

家庭共享的每周食谱规划工具：菜品库（照片 + 做法步骤）→ 排下周菜谱 → 自动汇总购物清单
→ 到点提醒做饭 → 吃完记进历史。完全自建，跑在你自己的服务器上，用你自己的域名
（比如 `meal.xxx.fr`），不依赖任何第三方云服务。

## 功能一览

**菜品库**
- 照片（上传时自动压成主图 1600px + 缩略图 400px，按 EXIF 摆正）→ 第 6 节
- 做法步骤，每一步可以配图；「跟着做」全屏模式带计时器
- 一份够几人吃（份数换算的依据）→ 第 8 节
- 健康分 / 喜好分，两套独立的 1-5 分 → 第 16 节
- **买现成的**：熟食、冷冻披萨这类，只填「一份买多少」，不用登记食材和做法 → 第 13 节

**每周菜谱**
- **本周 / 下一周** 两周并行：本周随时改，下一周提前排 → 第 9 节
- 一顿可以配好几道菜；**出去吃** 的那顿不做饭、不进购物清单 → 第 11、14 节
- 自动排菜只补空格，不会覆盖手工排的；已确认的周受保护 → 第 10 节
- 「本周备餐」按家庭人数算出每道菜要做几份，菜名可点进做法

**购物清单**
- 按份数放大用量，同类单位自动合并（1 kg + 200 g 土豆 = 1200 g）→ 第 7、8 节
- 按食材分类分组，勾选有离线队列（断网也能勾，联网自动补发）

**做饭提醒**
- 到点前推送该准备哪几道菜；提前量会自动考虑最慢那道菜的耗时 → 第 20 节
- 家庭开关 + 每台设备各自订阅；出去吃的那顿不提醒

**吃饭历史**
- 整周过完自动归档；`< >` 翻周查看，菜名可点进做法 → 第 15 节
- 每一顿单独打喜好分；总览给出健康 / 喜好均分
- 逐餐记录通过 `GET /api/history` 输出，留给以后的推荐算法当输入

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

### 22. 配置你的 nginx

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
│   │   ├── inviteCode.js    家庭邀请码生成（去掉易混字符）
│   │   ├── historyStats.js  历史汇总统计（纯函数）
│   │   ├── weekDays.js      一周 7 天 x 4 餐的骨架
│   │   ├── recommend.js     每周菜谱推荐算法（纯函数）
│   │   └── routes/
│   │       ├── auth.js      注册/登录/建家庭/加入家庭
│   │       ├── admin.js     管理员后台：审核账号、设管理员、删账号
│   │       ├── units.js     给表单下拉框用的单位列表
│   │       ├── family.js    家庭管理：改名/邀请码/成员/转让/退出
│   │       ├── history.js   过去几周吃了什么（逐餐记录 + 汇总）
│   │       ├── recipes.js   菜品库 CRUD + 图片上传
│   │       ├── menu.js      本周菜谱：查询/生成/手动调整
│   │       └── shopping.js  购物清单：查询/生成/勾选
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
                      meal_times, notify_enabled, notify_lead_minutes
users                 id, email, password_hash, display_name, family_id,
                      status(pending/approved/rejected), is_admin, approved_at, approved_by
recipes               id, family_id, name, category, meals[], time_minutes, servings,
                       is_store_bought, health_score, like_score,
                       tags[], last_cooked_date, photo_url, thumb_url
ingredients            recipe_id, name, amount, unit, category
steps                  recipe_id, sort_order, title, content, timer_seconds,
                       photo_url, thumb_url
weekly_menus           id, family_id, week_start, confirmed_at
menu_slots             weekly_menu_id, date, weekday, meal_slot, recipe_id, recipe_name,
                       is_eat_out, like_score, health_score
                       （一格可多行 = 一顿多道菜；recipe_name 是快照，删菜谱也留着）
shopping_lists         id, family_id, week_start
shopping_list_items    shopping_list_id, name, category, qty, unit, checked
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
