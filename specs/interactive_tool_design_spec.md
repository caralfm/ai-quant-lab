# 指标计算交互工具 设计文档

> **文档定位**：本文档是 HTML 交互式指标计算工具的产品设计 spec，作为后续开发的唯一约定来源。
> **版本**：v1.0  | **日期**：2026-07-18  | **状态**：设计阶段（未开发）
> **前置依赖**：`stock_data_spec.md` (task01 取数规范)、`indicator_lab_spec.md` v1.2 (task02 指标公式 + D1-D4 决策)

---

## 1. 产品概述

### 1.1 一句话定义
一个**纯浏览器端**的交互式技术指标实验室：选股票 → 选指标 → 调参数 → 看图表实时重绘，把 task02 notebook 里的"指标计算"变成可点可调的可视化工具。

### 1.2 目标用户
- 学习技术指标的投资者 / 学生
- 想快速对比不同参数下指标形态的分析者
- 不需要写代码就能理解"参数变了，指标怎么变"

### 1.3 核心价值
| 价值 | 说明 |
|------|------|
| 闭环体验 | 选股 → 算指标 → 调参数 → 看变化，全在一个页面 |
| 即时反馈 | 拖动参数滑块，图表 < 100ms 内重绘 |
| 教学对齐 | 计算逻辑与 task02 notebook 完全一致（D1-D4），所见即所学 |
| 零部署 | 纯前端单页应用，双击 index.html 即用 |

### 1.4 非目标 (Out of Scope)
- ❌ 策略回测 / 信号回测（留给 task03）
- ❌ 实时行情推送（只读历史 CSV）
- ❌ 选股推荐 / 买卖建议
- ❌ 多账户 / 登录 / 云端同步
- ❌ 交易下单

---

## 2. 功能范围 (Scope)

### 2.1 功能清单

| 编号 | 功能 | 优先级 | 说明 |
|------|------|--------|------|
| F1 | 股票选择 | P0 | 下拉选择已有股票，切换后重载 + 重算 |
| F2 | 日期范围 | P0 | 滑动选择起止日期，图表缩放 |
| F3 | 4 指标计算 | P0 | RSI / MACD / 布林带 / ATR，浏览器实时计算 |
| F4 | 参数调节 | P0 | 每个指标独立参数面板，滑块 + 数字输入 |
| F5 | 实时重绘 | P0 | 参数变化即重算 + 重绘 |
| F6 | 指标视图切换 | P0 | 单指标聚焦 / 综合多图 两种视图 |
| F7 | 十字光标 | P0 | 鼠标悬停显示当日 OHLCV + 各指标值 |
| F8 | 涨跌着色 | P0 | A 股惯例：涨红跌绿 |
| F9 | 参数预设 | P1 | 经典预设（如 RSI 7/14、MACD 12/26/9、布林 20/2） |
| F10 | 导出快照 | P1 | 导出当前图表为 PNG |
| F11 | 指标值表 | P1 | 底部显示最近 N 日指标数值 |
| F12 | 预设保存 | P2 | 保存自定义参数组合到 localStorage |

### 2.2 不做但预留接口
- 多股同屏对比（Phase 2）
- 自定义指标公式编辑器（Phase 3）

---

## 3. 用户故事

| ID | 角色 | 故事 |
|----|------|------|
| US1 | 学生 | 我想选长川科技，看 RSI(14) 在历史行情上的形态，理解超买超卖区 |
| US2 | 学生 | 我想把 RSI 周期从 14 调到 7，看曲线变快后信号是否变多 |
| US3 | 学生 | 我想把 MACD 调成 5/35/5，对比默认 12/26/9 的差异 |
| US4 | 学生 | 我想看布林带收口时后续行情怎么走，逐日拖动十字光标观察 |
| US5 | 分析者 | 我想切换到澜起科技，同样参数下对比指标差异 |
| US6 | 分析者 | 我想导出当前 RSI 图为 PNG 放进报告 |
| US7 | 学生 | 我想同时看 4 个指标的综合视图，快速判断当前技术状态 |

---

## 4. 技术架构

### 4.1 架构选型：纯前端 SPA

```
┌──────────────────────────────────────────────┐
│              浏览器 (单页应用)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ UI 层    │  │ 计算层    │  │ 渲染层    │  │
│  │ 控件/布局 │→ │ 指标算法  │→ │ ECharts  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│        ↑             ↑                       │
│        │             │                       │
│   用户交互      OHLCV 原始数据                 │
│                  (CSV)                       │
└───────────────────┼──────────────────────────┘
                    │ fetch (本地文件 / 静态服务)
                    ▼
        ┌──────────────────────┐
        │  data/processed/     │
        │  {ts_code}_daily_*   │  ← task01 产出
        └──────────────────────┘
```

**关键决策：浏览器实时计算，而非加载预计算 CSV**

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| 预计算 CSV (含指标列) | 加载即显示 | 参数固定，无法调参 | ❌ |
| **浏览器实时计算** | 参数可调，即时反馈 | 需在 JS 实现算法 | ✅ |

只加载 daily OHLCV CSV（轻量，~250 行），4 个指标全部在 JS 中实时计算。这正是工具的核心价值——参数变了立刻看变化。

### 4.2 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 框架 | 原生 JS (无框架) | 单页轻量，无构建步骤，双击即用 |
| 图表 | ECharts 5 (CDN) | 与 task01 报告一致，支持 K线 + 多副图联动 |
| 数据 | 原生 fetch + PapaParse (CSV 解析) | CSV 解析稳健 |
| 样式 | 原生 CSS + CSS 变量 | 无依赖，易改主题 |
| 算法 | 手写 JS 实现 RSI/MACD/BB/ATR | 与 task02 notebook 公式逐行对齐，可教学 |

### 4.3 目录结构（开发时）

```
task02_indicator_lab/
├── interactive_tool/          # 本工具的开发目录（开发时创建）
│   ├── index.html             # 单页入口
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js             # 主控：状态管理 + 事件绑定
│   │   ├── indicators.js      # 4 个指标算法（对齐 D1-D4）
│   │   ├── render.js          # ECharts 图表渲染
│   │   └── config.js          # 股票清单、默认参数、预设
│   └── README.md
├── ui_mockup.html             # ← 本设计阶段产出（界面 mockup，非功能）
└── interactive_tool_design_spec.md  # ← 本文件
```

---

## 5. 数据流设计

### 5.1 状态机

```
[初始] → 加载股票清单 → 选默认股票
   ↓
[选股] fetch CSV → 解析为 OHLCV 数组 → 缓存
   ↓
[算指标] 用当前参数计算 4 个指标 → 合并到数据数组
   ↓
[渲染] 主图 K线 + 副图指标
   ↓
[交互] 用户调参 → 回到[算指标] → 重绘（不重载 CSV）
```

### 5.2 数据缓存策略
- 同一只股票的 OHLCV CSV 只 fetch 一次，缓存在内存
- 切换股票时保留旧数据缓存，切回时秒开
- 参数变化只触发重算，不触发网络请求

### 5.3 数据契约（输入）
工具只消费 task01 产出的 daily CSV，字段：
`ts_code, trade_date, open, high, low, close, pre_close, change, pct_chg, vol, amount`

---

## 6. 界面布局

### 6.1 整体布局（三栏 + 顶栏 + 底栏）

```
┌───────────────────────────────────────────────────────────────┐
│ 顶栏：[指标实验室]   股票▾  日期范围   [重置] [导出PNG]        │
├───────────────┬───────────────────────────────────────────────┤
│               │  视图切换：[RSI][MACD][布林带][ATR][综合]      │
│ 左侧参数面板   │ ┌─────────────────────────────────────────┐   │
│               │ │  主图：K线 + 可叠加(BB/MA)              │   │
│ ▸ RSI 参数     │ │                                         │   │
│   周期 [14]   │ │                                         │   │
│   超买 [70]   │ └─────────────────────────────────────────┘   │
│   超卖 [30]   │ ┌─────────────────────────────────────────┐   │
│               │ │  副图：当前选中指标 (RSI/MACD/BB/ATR)   │   │
│ ▸ MACD 参数   │ │                                         │   │
│   快线 [12]   │ │                                         │   │
│   慢线 [26]   │ └─────────────────────────────────────────┘   │
│   信号 [9]    │                                               │
│               │  （综合视图时，此区堆叠 4 个副图）            │
│ ▸ 布林带      │                                               │
│   周期 [20]   │                                               │
│   σ倍数 [2]   │                                               │
│               │                                               │
│ ▸ ATR 参数    │                                               │
│   周期 [14]   │                                               │
│               │                                               │
├───────────────┴───────────────────────────────────────────────┤
│ 底栏：最近 N 日指标值表（日期|close|RSI|MACD_hist|BB%B|ATR）    │
└───────────────────────────────────────────────────────────────┘
```

### 6.2 区域职责

| 区域 | 职责 | 关键控件 |
|------|------|---------|
| 顶栏 | 全局操作 | 股票下拉、日期范围、重置、导出 |
| 左侧参数面板 | 4 个折叠式指标参数区 | 滑块 + 数字输入 + 预设按钮 |
| 视图切换 | 切换单指标 / 综合 | 5 个 tab |
| 主图区 | K 线 + 可叠加指标 | K 线、成交量、布林带轨道 |
| 副图区 | 当前指标独立图 | RSI 振荡器 / MACD 柱 / ATR 线 |
| 底栏 | 数值表 | 最近 N 日所有指标值 |

### 6.3 视图模式

**单指标模式**（RSI/MACD/BB/ATR 任一）：
- 主图：K 线 + 该指标在主图的叠加部分（如布林带的三轨叠加在 K 线上）
- 副图：该指标的独立子图（如 RSI 振荡器、MACD 柱状图）
- 左侧：仅高亮当前指标参数区，其余折叠

**综合模式**：
- 主图：K 线 + 布林带（默认叠加）
- 副图区：4 个指标子图纵向堆叠（RSI / MACD / ATR / BB%B），共用 X 轴联动

---

## 7. 四指标参数面板设计

### 7.1 RSI 参数

| 参数 | 控件 | 范围 | 默认 | 步长 |
|------|------|------|------|------|
| period | 滑块+输入 | 2–30 | 14 | 1 |
| 超买阈值 | 滑块+输入 | 60–90 | 70 | 1 |
| 超卖阈值 | 滑块+输入 | 10–40 | 30 | 1 |
| 预设 | 按钮组 | — | 经典14 / 短线7 / 长线21 | — |

**副图渲染**：RSI 折线（主色），超买/超卖两条水平参考线，0–100 纵轴，超买区淡红底色，超卖区淡绿底色。

### 7.2 MACD 参数

| 参数 | 控件 | 范围 | 默认 | 步长 |
|------|------|------|------|------|
| 快线 EMA | 滑块+输入 | 5–20 | 12 | 1 |
| 慢线 EMA | 滑块+输入 | 15–40 | 26 | 1 |
| 信号线 | 滑块+输入 | 3–15 | 9 | 1 |
| 预设 | 按钮组 | — | 经典12/26/9 | — |

**副图渲染**：DIF 折线（白）、DEA 折线（黄）、MACD 柱（涨红跌绿，**不乘 2**，对齐 D1），0 轴参考线。金叉/死叉点用箭头标注（P2）。

### 7.3 布林带参数

| 参数 | 控件 | 范围 | 默认 | 步长 |
|------|------|------|------|------|
| period | 滑块+输入 | 10–30 | 20 | 1 |
| σ 倍数 | 滑块+输入 | 1.0–3.0 | 2.0 | 0.1 |
| 预设 | 按钮组 | — | 经典20/2 | — |

**渲染**：上下轨 + 中轨三条线叠加在主图 K 线上，轨道间淡色填充。σ 用**总体标准差 ddof=0**（对齐 D3）。副图显示带宽 width 与 %B。

### 7.4 ATR 参数

| 参数 | 控件 | 范围 | 默认 | 步长 |
|------|------|------|------|------|
| period | 滑块+输入 | 5–30 | 14 | 1 |
| 显示倍数 | 滑块+输入 | 1.0–3.0 | 1.0 | 0.5 |
| 预设 | 按钮组 | — | 经典14 | — |

**副图渲染**：ATR 折线（主色），可选在主图上叠加"止损线 = close − N×ATR"参考线（P1）。

---

## 8. 交互流程

### 8.1 核心交互：调参重绘

```
用户拖动滑块
   ↓ (input 事件，防抖 50ms)
读取当前 4 组参数
   ↓
indicators.js 重算（仅受影响指标）
   ↓
render.js 更新对应 ECharts series
   ↓
副图 < 100ms 刷新
```

### 8.2 切换股票

```
下拉选择新股票
   ↓
检查缓存：有 → 直接用；无 → fetch CSV
   ↓
用当前参数重算 4 指标
   ↓
主图 + 副图全部重绘
   ↓
顶部股票名 / 最新价 / 涨跌更新
```

### 8.3 视图切换

```
点击 tab (RSI/MACD/BB/ATR/综合)
   ↓
切换副图渲染目标
   ↓
左侧高亮对应参数区，其余折叠
   ↓
无需重算（指标已算好），仅重排图表
```

### 8.4 十字光标联动

主图与副图共享 X 轴（日期）。鼠标悬停主图任一日：
- 主图：显示当日 OHLCV 浮窗
- 所有副图：同步显示该日各指标值
- 底栏表格：高亮该日行

---

## 9. 对齐 task02 spec 的 D1-D4 决策

本工具的 `indicators.js` 必须与 task02 notebook 的计算逻辑**逐行对齐**，确保"工具里看到的"和"notebook 里算的"完全一致。

| 决策 | notebook 实现 | 工具 JS 实现 | 验证方式 |
|------|--------------|-------------|---------|
| **D1** MACD 柱不乘 2 | `hist = DIF - DEA` | `hist = dif - dea` | 对比两者 hist 列数值一致 |
| **D2** Wilder 用 ewm(alpha=1/n) | `.ewm(alpha=1/14, adjust=False)` | 自实现 EMA：`ema[i] = ema[i-1] + (1/n)*(val-ema[i-1])` | 对比 RSI/ATR 数值一致 |
| **D3** 布林带 ddof=0 | `.rolling(20).std(ddof=0)` | 自实现总体标准差：`sqrt(sum((x-mean)^2)/n)` | 对比 BB 上下轨一致 |
| **D4** warmup 保留 NaN | 不填 0 / 不 ffill | warmup 期返回 `null`，图表该段不画线 | 副图前 N 期无线段 |

**实现要求**：开发时，工具计算结果需与 `outputs/changchuan_indicators.csv` 做数值比对，容差 1e-6，作为验收标准之一。

---

## 10. 指标算法（JS 实现规范）

### 10.1 RSI（Wilder）
```js
function calcRSI(closes, period) {
  // 1. 涨跌分离
  // 2. 首次平均 = 前 period 期均值
  // 3. Wilder 递推: avg_t = avg_{t-1} + (1/period)*(val_t - avg_{t-1})
  // 4. RS = avg_gain / avg_loss; RSI = 100 - 100/(1+RS)
  // 5. warmup 前 period 期返回 null (D4)
  // 6. avg_loss 确切为 0 时 RSI=100; NaN 时不替换 (保留 null)
}
```

### 10.2 MACD
```js
function calcMACD(closes, fast, slow, signal) {
  // 1. EMA: alpha = 2/(N+1), adjust=False
  // 2. DIF = EMA_fast - EMA_slow
  // 3. DEA = EMA(DIF, signal)
  // 4. hist = DIF - DEA  (不乘 2, D1)
  // 5. warmup 前 slow 期返回 null
}
```

### 10.3 布林带
```js
function calcBollinger(closes, period, k) {
  // 1. mid = SMA(close, period)
  // 2. std = sqrt(sum((x-mid)^2)/period)  // ddof=0, D3
  // 3. upper = mid + k*std; lower = mid - k*std
  // 4. width = (upper-lower)/mid; %B = (close-lower)/(upper-lower)
  // 5. warmup 前 period 期返回 null
}
```

### 10.4 ATR（Wilder）
```js
function calcATR(highs, lows, closes, period) {
  // 1. TR = max(H-L, |H-preC|, |L-preC|)
  // 2. 首次 ATR = 前 period 期 TR 均值
  // 3. Wilder 递推: atr_t = atr_{t-1} + (1/period)*(tr_t - atr_{t-1})  // D2
  // 4. warmup 前 period 期返回 null
}
```

---

## 11. 可视化规范

### 11.1 配色（A 股惯例 + 浅色主题）

| 元素 | 颜色 | 说明 |
|------|------|------|
| 涨 K 线 | `#D85A30` (coral-400) | 涨红 |
| 跌 K 线 | `#1D9E75` (teal-400) | 跌绿 |
| RSI 线 | `#185FA5` (blue-600) | 主色 |
| 超买区底色 | `#FAECE7` (coral-50) | 淡红 |
| 超卖区底色 | `#E1F5EE` (teal-50) | 淡绿 |
| MACD DIF | `#378ADD` (blue-400) | 快线 |
| MACD DEA | `#BA7517` (amber-600) | 信号线 |
| 布林上轨 | `#534AB7` (purple-600) | |
| 布林中轨 | `#888780` (gray-400) | 虚线 |
| 布林下轨 | `#534AB7` (purple-600) | |
| ATR 线 | `#993556` (pink-600) | |
| 背景 | 白 / `--color-background-primary` | 浅色主题 |
| 文字 | `#2C2C2A` (gray-900) | 深色文字 |

### 11.2 字体
- 中文：系统默认无衬线（PingFang SC / Microsoft YaHei）
- 数字：等宽字体（如 SF Mono / Consolas），便于对齐

### 11.3 图表规格
- 主图高度：60% 视口高
- 副图高度：单指标模式 35%，综合模式每个 18%
- DPI：2x（Retina 适配）
- 十字光标：虚线 + 浮窗

---

## 12. 验收标准

| ID | 标准 | 验证方式 |
|----|------|---------|
| V1 | 双击 index.html 可在浏览器打开，无报错 | 控制台无 error |
| V2 | 股票下拉含 3 只股票（长川/澜起/浪潮） | 下拉项数=3 |
| V3 | 切换股票后图表在 200ms 内更新 | 计时 |
| V4 | 调参后副图在 100ms 内重绘 | 计时 |
| V5 | RSI ∈ [0,100]，warmup 前 14 期无值 | 数据检查 |
| V6 | MACD hist = DIF - DEA（不乘 2） | 与 notebook CSV 对比容差 1e-6 |
| V7 | 布林带 ddof=0 | 与 notebook CSV 对比容差 1e-6 |
| V8 | ATR Wilder 平滑与 notebook 一致 | 与 notebook CSV 对比容差 1e-6 |
| V9 | 涨红跌绿着色正确 | 视觉检查 |
| V10 | 十字光标联动主副图 | 鼠标交互 |
| V11 | 综合视图 4 副图堆叠正常 | 视觉检查 |
| V12 | 导出 PNG 功能可用 | 下载文件 |

---

## 13. 扩展性设计

### 13.1 股票清单可扩展
股票清单从 `config.js` 读取，新增股票只需：
1. 在 `data/processed/` 放入对应 CSV
2. 在 config 的 `stocks` 数组加一项

```js
// config.js 示例
const STOCKS = [
  { code: "300604.SZ", name: "长川科技", file: "../../data/processed/300604.SZ_daily_20250718_20260718.csv" },
  { code: "688008.SH", name: "澜起科技", file: "../../data/processed/688008.SH_daily_20250718_20260718.csv" },
  { code: "000977.SZ", name: "浪潮信息", file: "../../data/processed/000977.SZ_daily_20250718_20260718.csv" },
];
```

### 13.2 指标可扩展
每个指标实现统一接口：
```js
const INDICATORS = {
  rsi:       { params: {...}, calc: calcRSI,       render: renderRSI },
  macd:      { params: {...}, calc: calcMACD,      render: renderMACD },
  bollinger: { params: {...}, calc: calcBollinger,  render: renderBB },
  atr:       { params: {...}, calc: calcATR,       render: renderATR },
  // 新增指标只需加一项
};
```

---

## 14. 非功能需求

| 项 | 要求 |
|----|------|
| 性能 | 250 行数据 × 4 指标重算 < 50ms |
| 浏览器 | Chrome 90+ / Edge 90+ / Safari 15+ |
| 分辨率 | 1280×720 起步，推荐 1440×900 |
| 响应式 | 桌面优先；平板可用（参数面板折叠为抽屉） |
| 无障碍 | 滑块支持键盘操作，图表有 aria-label |
| 安全 | 纯前端，无网络上报，数据不出浏览器 |

---

## 15. 演进路线 (Roadmap)

| 阶段 | 范围 | 交付物 |
|------|------|--------|
| **Phase 1 (MVP)** | 单指标视图 + 参数调节 + K 线主图 + 1 副图 | 可用的 index.html |
| **Phase 2** | 综合视图 + 十字光标联动 + 导出 PNG + 预设 | 完整版 |
| **Phase 3** | 多股对比 + 自定义指标 + 参数保存 + 主题切换 | 增强版 |

**本次设计阶段产出**：本设计文档 + `ui_mockup.html`（界面 mockup，供评审，非功能实现）。

---

## 16. YAML 配置块（机器可读）

```yaml
tool:
  name: indicator_lab_interactive
  version: "1.0"
  type: frontend_spa
  entry: interactive_tool/index.html

stocks:
  - code: "300604.SZ"
    name: "长川科技"
    file: "../../data/processed/300604.SZ_daily_20250718_20260718.csv"
  - code: "688008.SH"
    name: "澜起科技"
    file: "../../data/processed/688008.SH_daily_20250718_20260718.csv"
  - code: "000977.SZ"
    name: "浪潮信息"
    file: "../../data/processed/000977.SZ_daily_20250718_20260718.csv"

indicators:
  rsi:
    defaults: { period: 14, overbought: 70, oversold: 30 }
    presets:
      - { name: "经典14",  period: 14 }
      - { name: "短线7",   period: 7 }
      - { name: "长线21",  period: 21 }
  macd:
    defaults: { fast: 12, slow: 26, signal: 9 }
    presets:
      - { name: "经典12/26/9", fast: 12, slow: 26, signal: 9 }
  bollinger:
    defaults: { period: 20, k: 2.0 }
    presets:
      - { name: "经典20/2", period: 20, k: 2.0 }
  atr:
    defaults: { period: 14, multiplier: 1.0 }
    presets:
      - { name: "经典14", period: 14 }

design_decisions:
  D1: "MACD hist = dif - dea (不乘 2)"
  D2: "Wilder smoothing = ema(alpha=1/n, adjust=False)"
  D3: "Bollinger std ddof=0 (总体标准差)"
  D4: "warmup 期保留 null, 不填 0 / 不 ffill"

colors:
  up: "#D85A30"        # 涨红
  down: "#1D9E75"      # 跌绿
  rsi: "#185FA5"
  macd_dif: "#378ADD"
  macd_dea: "#BA7517"
  bb_band: "#534AB7"
  atr: "#993556"
  bg: "#FFFFFF"
  text: "#2C2C2A"

layout:
  top_bar: [stock_selector, date_range, reset, export]
  left_panel: collapsible_param_sections
  main_chart: candlestick_with_overlay
  sub_chart: active_indicator
  bottom: value_table
  views: [rsi, macd, bollinger, atr, overview]
```

---

## 17. 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-07-18 | 初版：产品概述、12 项功能、3 栏布局、4 指标参数面板、D1-D4 对齐、JS 算法规范、验收标准、YAML 配置 |
