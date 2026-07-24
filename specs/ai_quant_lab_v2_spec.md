# AI Quant Lab 作品集站点 改造规范 (ai-quant-lab v2.0 Spec)

> 版本: v2.0 · 生成日期: 2026-07-24
> 适用范围: 将 ai-quant-lab 从单一交互工具改造为多策略作品集站点
> 上游依赖: task02 `interactive_tool_design_spec.md`、task03 `turtle_backtest_spec.md`
> 维护方式: 修改本文件即生效，站点实现以本 spec 为唯一约定来源

---

## 0. 任务目标

### 0.1 一句话定义

将 ai-quant-lab 改造为**量化策略作品集站点**——一个首页聚合所有策略作品，每个策略独立子页面可单独访问、可独立部署、可随时新增。

### 0.2 核心价值

| 现在 (v1.x) | 改造后 (v2.0) |
|------------|-------------|
| 单一工具：交互式指标实验室 | **作品集站点**：首页 → 多个策略子页面 |
| 入口是 `interactive_tool/index.html` | 入口是根目录 `index.html`（首页） |
| 新增策略无处安放 | 新增策略 = 新建 `strategies/xxx/` + 首页加卡片 |
| 无站点导航 | 统一的"← 返回首页" + 页脚 |
| 两个独立部署 | 一个站点统一部署到 Pages |

### 0.3 非目标 (Out of Scope)

- ❌ 不做用户登录 / 账户系统
- ❌ 不做策略在线编辑
- ❌ 不做策略参数云端同步
- ❌ 不做多语言 (首版仅中文)
- ❌ 不改造单页内部的功能逻辑 (interactive_tool 和 turtle_backtest 内部算法不变)

---

## 1. 站点结构

### 1.1 路由规划

```
/                           → 首页 (作品集展示)
/strategies/indicator-lab/  → 指标实验室 (task02)
/strategies/turtle-backtest/ → 海龟回测看板 (task03)
/strategies/{future}/       → 未来新增策略
```

### 1.2 目录结构

```
ai-quant-lab/
├── index.html                   # 首页 (NEW)
├── css/
│   └── home.css                 # 首页样式 (NEW)
├── js/
│   └── home.js                  # 首页交互 (NEW)
│
├── strategies/
│   ├── indicator-lab/           # ← task02 内容搬入
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── config.js
│   │       ├── data.js
│   │       ├── indicators.js
│   │       ├── render.js
│   │       └── app.js
│   │
│   ├── turtle-backtest/         # ← task03 内容搬入
│   │   ├── index.html
│   │   ├── css/style.css
│   │   ├── js/
│   │   │   ├── indicators.js
│   │   │   ├── engine.js
│   │   │   ├── metrics.js
│   │   │   ├── chart-kline.js
│   │   │   ├── chart-equity.js
│   │   │   ├── data-loader.js
│   │   │   └── app.js
│   │   └── data/
│   │       ├── 300604.SZ_daily.csv
│   │       ├── 688008.SH_daily.csv
│   │       └── 000977.SZ_daily.csv
│   │
│   └── {future-strategy}/       # 模板 (未来新增)
│       ├── index.html
│       └── ...
│
├── specs/                       # 已有，不动
│   ├── stock_data_spec.md
│   ├── indicator_lab_spec.md
│   ├── interactive_tool_design_spec.md
│   ├── turtle_backtest_spec.md        # ← 从 task03 复制
│   └── ai_quant_lab_v2_spec.md        # ← 本文件
│
├── notebooks/                   # 已有，不动
├── scripts/                     # 已有，不动
├── tests/                       # 已有，不动
├── data/                        # 已有，不动
├── charts/                      # 已有，不动
│
├── .github/workflows/deploy.yml # Pages 部署 (NEW)
└── README.md                    # 更新
```

### 1.3 不做的事

- 不删除原有根目录的任何文件（`interactive_tool/`、`data/` 等保留不删，向前兼容）
- `strategies/` 下的每个子目录是**独立可用的完整应用**（可双击 index.html 单独运行）
- 不引入构建工具，保持纯静态站点

### 1.4 从 task03 搬入内容

| 源 | 目标 | 说明 |
|----|------|------|
| `task03_turtle_backtest/index.html` | `strategies/turtle-backtest/index.html` | 主页面 |
| `task03_turtle_backtest/js/*` | `strategies/turtle-backtest/js/*` | 全部 JS |
| `task03_turtle_backtest/css/*` | `strategies/turtle-backtest/css/*` | 样式 |
| `task03_turtle_backtest/data/*` | `strategies/turtle-backtest/data/*` | CSV 数据 |
| `task03_turtle_backtest/turtle_backtest_spec.md` | `specs/turtle_backtest_spec.md` | Spec |

---

## 2. 首页设计

### 2.1 页面结构

```
┌──────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════╗ │
│  ║         AI Quant Lab                        ║ │
│  ║         量化策略实验室                        ║ │
│  ║         ——————                              ║ │
│  ║  A股技术指标 · 经典策略回测 · 可视化分析       ║ │
│  ╚══════════════════════════════════════════════╝ │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  📊 指标实验室     │  │  🐢 海龟回测看板      │  │
│  │                   │  │                      │  │
│  │  RSI / MACD /     │  │  S1/S2 双系统回测    │  │
│  │  布林带 / ATR     │  │  ATR仓位管理          │  │
│  │  实时参数调节      │  │  买卖点可视化         │  │
│  │                   │  │                      │  │
│  │  [ 进入工具 → ]   │  │  [ 进入看板 → ]      │  │
│  └──────────────────┘  └──────────────────────┘  │
│                                                   │
│  ┌──────────────────────┐                        │
│  │  🔮 更多策略开发中...  │                        │
│  │                      │                        │
│  │  因子选股 · 均值回归  │                        │
│  │  网格交易 · 配对交易  │                        │
│  │  ML预测 · 期权策略   │                        │
│  └──────────────────────┘                        │
│                                                   │
│  ─────────────────────────────────────────────── │
│  AI Quant Lab © 2026 · GitHub Pages              │
└──────────────────────────────────────────────────┘
```

### 2.2 首页 Hero 区

- 标题: "AI Quant Lab"
- 副标题: "量化策略实验室"
- 描述: "A股技术指标 · 经典策略回测 · 可视化分析"
- 背景: 纯色渐变或极简几何装饰（无大图，保持加载速度）
- 可选: 显示数据最新更新日期

### 2.3 策略卡片

每张卡片包含：
- **图标** (emoji 或 SVG icon)
- **策略名称**
- **一句话描述** + 关键技术点（3-4 个标签）
- **"进入 →" 按钮** — 跳转到策略子页面
- **悬停动画**: 轻微上浮 + 阴影加深

### 2.4 "即将推出"占位区

- 3-4 张半透明卡片，展示未来计划添加的策略方向
- 标签: "开发中" / "规划中"
- 不可点击

---

## 3. 设计系统

### 3.1 全局 CSS 变量 (与 task02/task03 共享)

```css
:root {
  --bg-page: #F7F6F2;
  --bg-card: #FFFFFF;
  --bg-soft: #F1EFE8;
  --text-primary: #2C2C2A;
  --text-secondary: #5F5E5A;
  --text-tertiary: #999892;
  --border: #E3E1D8;
  --border-strong: #B4B2A9;
  --up: #D85A30;        /* 涨·红 */
  --down: #1D9E75;      /* 跌·绿 */
  --blue: #185FA5;
  --gold: #BA7517;
  --radius: 8px;
  --radius-lg: 12px;
}
```

### 3.2 导航规范

每个策略子页面顶部统一包含返回链接：

```html
<a href="../../" class="back-link">← 返回首页</a>
```

样式: 左上角固定，颜色 `--text-tertiary`，hover 变 `--blue`。

### 3.3 页脚

所有页面统一页脚：
```
AI Quant Lab · 数据来源 Tushare · 仅用于学习研究
```
样式: 居中、小字、浅色。

### 3.4 响应式

- 桌面端: 卡片横向排列 (2-3 列)
- 平板: 2 列
- 手机: 单列堆叠
- 策略子页面内部已有的响应式逻辑保持不变

---

## 4. 策略注册机制

### 4.1 新增策略的标准步骤

1. 在 `strategies/` 下创建新目录，如 `strategies/factor-screener/`
2. 放入 `index.html` + 相关资源 (js/css/data)
3. 在 `strategies/` 目录下新建 `registry.json`（或直接在首页 HTML 中维护策略列表）
4. 首页自动读取注册表，渲染策略卡片

> **决策 D1**: 首版采用**硬编码方式**在首页 HTML 中维护策略卡片列表。不需要 registry.json 的复杂性。未来策略超过 5 个时再考虑数据驱动方案。

### 4.2 首页卡片数据结构 (HTML 中的策略列表)

```javascript
const strategies = [
  {
    id: 'indicator-lab',
    name: '指标实验室',
    icon: '📊',
    description: 'RSI / MACD / 布林带 / ATR 四项经典技术指标的交互式计算与可视化',
    tags: ['RSI', 'MACD', '布林带', 'ATR'],
    url: 'strategies/indicator-lab/',
    status: 'active',  // active | coming-soon
  },
  {
    id: 'turtle-backtest',
    name: '海龟回测看板',
    icon: '🐢',
    description: '基于 Richard Dennis 海龟交易法则的双系统回测，含 ATR 仓位管理与买卖点标注',
    tags: ['海龟法则', 'S1/S2', '回测', 'ATR'],
    url: 'strategies/turtle-backtest/',
    status: 'active',
  },
  {
    id: 'factor-screener',
    name: '因子选股器',
    icon: '🔍',
    description: '多因子筛选 + 排名 + 组合回测，一键找出符合条件的股票',
    tags: ['多因子', '选股', '排序'],
    url: '#',
    status: 'coming-soon',
  },
  // ...更多
];
```

### 4.3 策略页面的自包含要求

每个 `strategies/{name}/` 目录必须满足:
- 可**双击** `index.html` 直接打开使用（相对路径引用资源）
- 所有 CSS/JS/数据均在本目录内（或通过相对路径引用共享资源）
- 不依赖根目录的任何文件（除了可选的 CDN 如 ECharts）
- 页面内包含 `← 返回首页` 链接

---

## 5. 首页视觉设计

### 5.1 配色

| 区域 | 背景 | 文字 |
|------|------|------|
| 页面 | `#F7F6F2` (--bg-page) | `#2C2C2A` (--text-primary) |
| Hero 区 | `#FFFFFF` → `#F1EFE8` 渐变 | — |
| 策略卡片 | `#FFFFFF` (--bg-card) | — |
| 即将推出卡片 | `#FFFFFF` + opacity 0.5 | 灰色调 |
| 页脚 | 透明 / `--bg-card` | `--text-tertiary` |

### 5.2 Hero 区具体设计

- 内边距: 60px 上下
- 标题字号: 28px, font-weight: 600
- 副标题: "量化策略实验室" 16px, font-weight: 400, color: --text-secondary
- 描述行: 12px 标签组, 用 · 分隔
- 右上角可放一个小的 GitHub 图标链接

### 5.3 卡片具体设计

```
┌─────────────────────────────┐
│ 🐢                           │  ← 图标, 24px
│                              │
│ 海龟回测看板                  │  ← 名称, 16px, bold
│                              │
│ 基于 Richard Dennis 海龟     │  ← 描述, 13px, --text-secondary
│ 交易法则的双系统回测...       │
│                              │
│ [海龟法则] [S1/S2] [回测]    │  ← 标签, 11px, 圆角背景
│                              │
│                    进入 →    │  ← 链接, 14px, --blue
└─────────────────────────────┘
```

- 卡片宽度: ~320px, flex
- 圆角: 12px, border: 0.5px solid --border
- 悬停: `transform: translateY(-2px)`, `box-shadow: 0 4px 16px rgba(0,0,0,0.06)`
- 过渡: 0.2s ease

### 5.4 "即将推出"卡片

与活跃卡片相同结构，但:
- 整个卡片半透明 (opacity: 0.6)
- 图标区域叠加 "开发中" 标签
- 链接不可点击
- 悬停动画禁用

---

## 6. 部署方案

### 6.1 GitHub Pages

- 仓库: `ai-quant-lab` (现有)
- Pages 源: GitHub Actions
- 站点根目录: 仓库根目录
- 访问方式:
  - 首页: `https://{username}.github.io/ai-quant-lab/`
  - 策略页: `https://{username}.github.io/ai-quant-lab/strategies/turtle-backtest/`

### 6.2 部署配置

复用 turtle-backtest 仓库的 workflow 模板：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: "pages"
  cancel-in-progress: false
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - uses: actions/deploy-pages@v4
        id: deployment
```

### 6.3 资源路径注意事项

- GitHub Pages 站点在子路径下 (`/ai-quant-lab/`)，所以**相对路径引用**不会受影响（因为我们不使用绝对路径 `/`）。
- 策略页面的"返回首页"链接用 `../../` 回到根目录。
- 所有 CSS/JS/数据引用均使用相对路径。

---

## 7. 实施计划

### Phase 1: 结构搭建 (本次)

| 步骤 | 操作 | 产出 |
|------|------|------|
| 1 | 创建 `strategies/` 目录 | 目录结构 |
| 2 | 将 `interactive_tool/` 内容复制到 `strategies/indicator-lab/` | 指标实验室子页面 |
| 3 | 将 `task03_turtle_backtest/` 内容复制到 `strategies/turtle-backtest/` | 海龟回测子页面 |
| 4 | 修复两个子页面中的"返回首页"链接 | 导航统⼀ |
| 5 | 编写根目录 `index.html` (首页) | 作品集首页 |
| 6 | 编写 `css/home.css` | 首页样式 |
| 7 | 配置 `.github/workflows/deploy.yml` | CI/CD |
| 8 | 推送到 GitHub，验证 Pages | 线上可访问 |

### Phase 2: 内容增强 (未来)

- 因子选股器 (factor-screener)
- 策略对比工具
- 首页加入数据最后更新时间

### Phase 3: 体验优化 (未来)

- 策略注册表 JSON 化
- 深色模式
- 站点搜索

---

## 8. 验收清单

| 编号 | 验收项 | 验证方式 |
|------|-------|---------|
| V1 | 访问根路径显示首页，非空白页 | 浏览器打开 index.html |
| V2 | 首页展示 2 个活跃策略卡片 + 至少 2 个"即将推出"占位 | 目视检查 |
| V3 | 点击"指标实验室"卡片 → 跳转到对应页面，功能正常 | 点击验证 |
| V4 | 点击"海龟回测看板"卡片 → 跳转到对应页面，功能正常 | 点击验证 |
| V5 | 策略子页面显示"← 返回首页"链接，点击回到首页 | 往返验证 |
| V6 | 首页卡片有悬停效果 | 鼠标悬停 |
| V7 | 响应式: 缩小浏览器窗口，卡片从横向变为纵向堆叠 | 调整窗口 |
| V8 | GitHub Pages 部署后所有链接正确 | 线上逐页点击 |
| V9 | 原有 interactive_tool/index.html 仍可双击独立打开 | 本地双击 |
| V10 | strategies/turtle-backtest/index.html 仍可双击独立打开 | 本地双击 |

---

## 9. 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-07-24 | 初版：ai-quant-lab v2.0 改造规范，定义站点结构、首页设计、部署方案、实施计划 |

---

> **下一步**: 按 §7 Phase 1 步骤依次执行，先搬内容再写首页，最后部署。
