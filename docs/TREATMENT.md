# OneKey Pro 2 — 介绍视频 treatment & style bible

> 这是整支片子的"总提示词"。每个场景 agent 动手前都要读它，改了决定就在文末"修订记录"里记一笔。
> 配乐与歌词见 [`SONG.md`](SONG.md)；参考照片见 `assets/reference/`（NDA，只作参考，绝不进画面）。

## 一句话概念

**钥匙留在家里，只有签名出门。** 全片是一组"图版"，每幅讲一个卖点、各有自己的视觉语言（工程蓝图、示波器、等高线、票据、代码、UI），但共用一套配色、字体、颗粒和节奏。贯穿全片的是**那把绿钥匙**：一粒 OneKey 绿的光点，它先画出 Logo 里的"1"和"O"，之后在每幅图版里都待在设备轮廓之内。**绿色永远不越过设备的边界**，越过边界的只有白色发丝线，也就是签名、二维码和授权。这条规则就是产品承诺，也是剪辑的语法。片尾光点回到设备正面，变成一颗待机指示灯，首尾帧相同，可以无缝循环。

## 基本参数

- 时长：**2:22.8**（Suno 原曲 3:01，剪掉无词段落后的版本，见 SONG.md 的"The take we use, and the edit"）
- 画幅：1920×1080 / 60 fps，可出 4K（`--scale 2`）
- 声音：Suno 生成的歌（英文），歌词逐词同步成画面里的字
- 语言：英文歌词与画面文字；中文版以后按同样结构另做

## 调性

- 大的变化卡在节拍上：切镜落在强拍，冲击落在军鼓，镜头运动缓入强拍。用强缓动（`outExpo`、`inOutCubic`、弹簧），先停住，再猛地动。
- 精密、冷静、贵：发丝线、高对比字体、克制的颜色、真实的材质光（玻璃反射、金属拉丝、磨砂渐变），只有绿色发光。
- 幽默但不耍宝：像一份一本正经的技术规格书，比如脚注、认证编号、"not online" 的状态标签。
- 不要"AI 味"，也不要"币圈味"：不要紫青霓虹、不要金币雨、不要 K 线暴涨、不要发光大脑、不要代码雨、不要满屏粒子星云、不要"区块链"方块链条。不要仿冒任何真实 App 的界面，第三方品牌只作为歌词里的字出现（FIDO、QR），不出现 Logo。

## 设备（按参考照片程序化建模）

没有工程文件，设备在代码里用 SDF 或几何体做出来，比例和细节取自 `assets/reference/` 的照片。**照片本身绝不进画面。**

- 外形：圆角矩形薄板，长宽比约 1.56 : 1，四角大圆角；像一张加厚的卡片。
- 正面：整块黑色玻璃屏，屏幕边框极窄，玻璃边缘有一圈细微高光。
- 背面：磨砂玻璃，自上而下由浅灰渐变到深石墨色；左上角一枚圆形摄像头，外面套金属环；正中是 OneKey"1O"钥匙标。
- 边框：石墨色金属中框，侧边有天线断点；一侧有一颗侧键；底边依次是 USB-C 口和三个扬声器孔。
- 屏幕 UI 只画我们自己的极简版本（钥匙标、签名确认、PIN 点），不照搬包装盒上的真实界面。
- 规格数字（屏幕尺寸、电池、芯片数量等）以第一代 Pro 官网为准，**上市前需逐条向 OneKey 确认 Pro 2 是否沿用**，见文末"待确认"。

## 配色（`app/src/engine/palette.ts`）

| token | 用途 | 值 |
|---|---|---|
| ink | 背景，设备的石墨黑 | `#0A0B0A` |
| ink2 | 面板、熄屏的屏幕 | `#141614` |
| graphite | 暗线、次要文字、金属中框 | `#5B5F5B` |
| ash | 中灰 | `#9A9F9A` |
| bone | 主文字、蓝图纸 | `#EEF0EC` |
| **signal** | **OneKey 绿**：钥匙光点、当前唱到的字、高亮 | `#44D62C` |
| ember | 绿色高光核心 | `#B1F4A9` |
| blood | 绿色的暗部 | `#108303` |

- 绿色取自 OneKey Logo（`assets/brand/`，来源 OneKeyHQ/app-monorepo），色阶取自其 `brand.ts`。
- 部分图版反转成**骨白纸 + 墨线**（蓝图、票据、规格书），让全片有明暗节奏。绿色在两种底上都保持绿色。
- 只有 signal 和 ember 可以超过约 0.85 的线性亮度（发光）；bone 文字必须锐利，不能泛光。
- 没有第二种强调色。

## 字体

- **Archivo**（宽度 62–125，字重 300–900）：歌词的声音，要大、紧、自信。拖长音时拉宽，受压时收窄。
- **IBM Plex Mono**：机器的声音，用于十六进制、地址、认证编号、标签、PIN。
- **Cormorant Garamond**：基本不用，只留给片尾一句（可选）。
- **单线字体**（`stroke.ts`）：用于被绿光点"写"出来的字。
- 版式：瑞士网格、非对称、大留白、发丝线分隔，大号展示字旁边配小号等宽注释。

## 歌词规则（所有图版）

- 每一句都要**可读**，并且**逐词同步**：一个词在它的 `start` 出现或点亮，在 `end` 前完成（`Lyrics.wordProgress`）。可以提前约 0.4 s 把整句淡淡露出来，但高亮永远不能跑在人声前面。
- 每幅图版用不同方式把字做进画面：刻在芯片上、印在二维码里、从十六进制解码出来、写在门牌上……不是贴在画面上的字幕。
- 默认：已唱部分用 signal 或 bone，未唱部分用约 30–40% 的 bone。
- 文字保持在标题安全区内（离边缘 ≥ 96 px）。

## 母题

1. **绿钥匙**：一粒绿光点，带亮核和短尾，拖一条发丝线。它画出"1O"钥匙标，并且始终在设备轮廓之内。
2. **边界**：设备的圆角矩形轮廓。绿色不出去，白色发丝线（签名、二维码、授权）可以出去。每幅图版都要让观众看见一次这条边界。
3. **钥匙标 1O**：数字"1"是钥匙齿，"O"是钥匙柄。O 可以变成摄像头环、指纹、门的把手；1 可以变成插进锁孔的钥匙。
4. **24 个格子**：助记词永远是 24 个被遮住的方块 `████`，**绝不出现任何真实或看似真实的助记词**。

## 图版（场景模块）

时间是剪辑版里的实际时间（约 126 BPM，微微加速），最终以 `src/timeline.ts` 为准（按歌词行定位、吸附到节拍网格）。不要在场景里硬编码时间。

| id | 时间窗 | 歌词 | 卖点 | 负责 |
|---|---|---|---|---|
| `boot` | 0:00–0:08 | （前奏） | 品牌 | lead |
| `slab` | 0:08–0:28 | Glass on the front… / …catching the light | 更优雅的设计 | A1 |
| `below` | 0:28–0:40 | Quiet by design… / …stays down below | 设计→安全 | A1 |
| `airgap` | 0:40–0:48 | Scan it, sign it, send it… / …plain type | 气隙二维码签名、明文签名 | A2 |
| `hook` ×2 | 0:48–1:07，1:51–2:11 | Keep your keys at home… | 私钥不出设备 | A3 |
| `vault` | 1:07–1:14 | Four secure elements… / …don't have to trust | 4 颗 EAL 6+ 安全芯片 | A4 |
| `lens` | 1:14–1:22 | A camera on the back… / …nothing online | 气隙 | A2 |
| `guard` | 1:22–1:29 | The contract says "approve all"… / …hex on a plate | SignGuard、明文签名 | A5 |
| `touch` | 1:29–1:37 | Touch to unlock it… / …wipes itself to dust | 指纹、PIN、错误自毁 | A4 |
| `passkey` | 1:37–1:51 | It's not just your coins… / …no phishing link tonight | **FIDO 与 Passkey** | A6 |
| `end` | 2:11–2:23 | OneKey Pro 2 | 片名 | lead |

### `boot` — "开机"
全黑。第一拍，画面中央亮起一粒绿点，像待机灯，随底鼓呼吸。第二小节，它拖着发丝线，用单线字体笔画写出"1"（一个短横加一竖），落笔在强拍；第三小节画出"O"。第四小节，"O"的外圈长出一圈金属高光，变成摄像头环，镜头拉远，这是设备背面左上角的摄像头；在强拍上硬切到 `slab`。

### `slab` — "玻璃、玻璃、金属"
设备第一次完整出现，是一个真实材质的渲染（光线步进或几何体 + 环境反射），背景纯 ink。
- "Glass on the front"：正面，黑屏玻璃上一道高光顺着歌词扫过，字写在玻璃的反射里。
- "and glass on the back"：强拍上设备绕长轴翻转 180°（带动态模糊），露出磨砂渐变背面。
- "A ribbon of metal, graphite and black"：微距沿中框滑行，天线断点像节拍器一样在每个八分音符经过镜头；词印在中框的拉丝纹理上。
- "Thin as a card, it slips out of sight"：切到正侧面，设备变成一条发丝线那么薄；一张银行卡的线框从后面滑入对比厚度，然后设备滑出画面。
- "One little key mark catching the light"：背面俯拍，一道光扫过磨砂玻璃，"1O"钥匙标闪一下绿，这是全片第一次出现 Logo 色。

### `below` — "底下"
"Quiet by design, no edges to show"：设备正面熄屏，四周轮廓慢慢变成一条白色发丝线，这就是"边界"母题的首次亮相，旁边标注 `boundary`。"Everything that matters stays down below"：镜头穿过屏幕玻璃往下沉，画面反转成骨白蓝图纸，设备内部的剖面线一层层掠过；最底下一个小方格里亮着那粒绿钥匙，旁注 `private key · never leaves`。在强拍上把绿点交给 `airgap`。

### `airgap` — "扫、签、发"
蓝图纸底。"Scan it, sign it, send it"：一个二维码按八分音符逐块拼出（模块在底鼓上落下），摄像头环扫过它，三个词各自在一个强拍上盖章。"Not a single wire"：一根 USB 线的线稿从画外伸进来，在离设备还有一截时停住，中间是一段虚线和标注 `air gap`，线稿被剪断。"Read it before you mean it / Every word in plain type"：设备屏幕上用等宽字逐词打出一笔交易的明文（`Send 0.25 BTC to bc1q…7f3a`），读完一句，屏幕底部亮起"Confirm"按钮。

### `hook` ×2 — "钥匙留在家里"
全画幅 Archivo 900，一个词一次冲击：KEEP / YOUR / KEYS / AT / HOME。
- 规则可视化："home"是设备的圆角矩形轮廓。绿钥匙在里面，每唱一次"go"，就有一条白色签名发丝线从轮廓里射出画面，绿点却撞上边界弹回来。
- "Twenty-four words the internet will never know"：24 个被遮住的方块在网格里依次点亮（每个十六分音符一格），唱到"never know"时整张网格翻面成空白。
- "One key (OneKey), all yours"：数字"1"和"O"分别在"One"和"key"上砸下，合成钥匙标。
- n=1：bone 字、ink 底，干净。n=2（最终副歌）：OneKey 绿底、ink 字，更重；多一行 "Open source, read every line"：一段固件风格的代码（我们自己写的示意代码，不抄真实仓库）自下而上滚过，被唱到的那一行高亮。
- 结尾把钥匙标交给下一幅：n=1 交给 `vault`（1 插进芯片），n=2 交给 `end`。

### `vault` — "四个保险库"
骨白纸 + 墨线。"Four secure elements"：四颗芯片的工程线稿在四个强拍上依次落位，每颗的封装上刻着 `SE`；唱到"EAL six plus"时盖下认证章 `EAL 6+`。"Bank-card silicon"：一张银行卡的芯片触点图形和芯片并排，线条一一对应。"so you don't have to trust"：词里的"trust"被一条横线划掉，换成等宽字 `verify`。

### `lens` — "只读光"
ink 底，光学图风格。背面摄像头环放大成一个光圈，光线（发丝线）只从外往里进。"QR in, QR out"：手机的线框轮廓和设备之间两个二维码来回乒乓，每次过网落在军鼓上。"and nothing online"：画面角落有一个网络图标（地球的等高线画法），标 `offline`，灰色，始终不亮。

### `guard` — "等一下"
"The contract says 'approve all'?"：一整屏十六进制数据（`0x095ea7b3…ffffffff`）高速滚动，看不懂。"SignGuard says wait"：滚动在强拍上急停，一个反转的骨白标签砸下来：`WAIT`，旁边小字注 `unlimited approval · unknown contract`。"Clear signing in words, not hex on a plate"：十六进制逐段解码成一行英文（`Approve UNLIMITED USDT to 0x9f…e21c`），被唱到的词变绿，原来的十六进制像一块金属铭牌被推到画面外。

### `touch` — "指纹与自毁"
"Touch to unlock it"：指纹纹路用等高线画法一圈圈画出（和参考照片里的地图桌垫同一种语言，但是我们自己的线），中心亮绿，设备解锁。"a PIN if you must"：六个 PIN 圆点依次填满。"Too many wrong guesses"：错误计数器 `1/10 … 10/10`，一格一拍往上跳，每次错误画面轻微抖动。"it wipes itself to dust"：在强拍上，设备内部的一切（线稿、字、钥匙标）化成细颗粒散开，只剩空的圆角矩形轮廓。

### `passkey` — "每一扇门"（新卖点，重点）
"It's not just your coins anymore"：空轮廓里重新亮起绿钥匙，币种符号（只用字形 ₿ Ξ，不用 Logo）从轮廓里淡出。"It's the key to every door"：镜头推进一条由登录框组成的走廊，每个登录框是一扇发丝线的门（`Sign in` 标题加两个输入框），门在每个强拍上被绿钥匙依次打开。"FIDO in your pocket, passkeys, no passwords to type"：密码框里的 `••••••••` 一颗颗掉落，被一个钥匙图形替换，标注 `FIDO2 · passkey`。"Tap it once and you're in"：设备轻触一下（弹簧动画），最后一扇门打开。"no phishing link tonight"：一只用发丝线画的鱼钩从上面垂下来，钩向设备，在边界上被弹开，鱼线松掉落出画面。

### `end` — "片名"
设备正面，屏幕亮起：中央是绿色"1O"钥匙标，下方打出 `OneKey Pro 2`（Archivo，一个词一拍）。最后一拍，屏幕熄灭，只剩一粒绿色待机灯，和第一帧相同，可以循环。

## 需要的素材

- [x] 参考照片（`assets/reference/`，NDA）
- [x] Logo 与品牌绿（`assets/brand/`）
- [x] 歌曲：Suno 原曲 `audio/full/track.wav`，剪辑版 `audio/track.wav`，逐词时间轴 `data/lyrics.json`
- [ ] 待确认的 Pro 2 规格（见下）

## 待确认（上市前向 OneKey 核实）

以下来自第一代 Pro 官网，Pro 2 是否沿用需要确认：4 颗 EAL 6+ 安全芯片；背面摄像头用于气隙二维码签名；SignGuard；明文签名；指纹解锁；PIN 多次错误后自动清除；固件开源、可复现构建。Pro 2 新增的"更优雅的设计"、FIDO、Passkey 来自 Croath 的简报。

## 技术约定

见 `docs/ENGINE.md`：确定性渲染、逐词同步、节拍驱动的运动、强拍硬切，单帧 < 25 ms。

## 修订记录

- rev 5（2026-09-29）：设备尺寸定为 53.1 × 84.9 × 6.2 mm（Croath 提供）；材质按 iPhone Air：正面亮面玻璃、中框亮面金属、背面磨砂玻璃。`slab` 第 3 镜改成比“面积”：银行卡线框盖上背面几乎重合，再转到正侧面标 6.2 mm。`below`、`airgap` 初版完成。
- rev 4（2026-09-29）：`boot`、`slab` 初版完成。`slab` 第 3 镜暂不放“银行卡 0.76 mm”比例参照：真实厚度未确认前不做数字对比。
- rev 3（2026-09-29）：接入真实歌曲，按剪辑版（2:22.8）更新各图版时间窗；歌里唱的是 "Contract says…"（没有 The）。
- rev 2（2026-09-29）：完整初稿，包括概念、配色（OneKey 绿）、根据照片写的设备描述、11 幅图版，对应 SONG.md 的歌曲结构。
- rev 1：初始模板。
