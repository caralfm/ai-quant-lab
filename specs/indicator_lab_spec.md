# 技术指标计算实验规范 (Indicator Lab Spec)

> 版本: v1.0 · 生成日期: 2026-07-18
> 任务编号: task02_indicator_lab
> 适用范围: 基于长川科技日线数据计算 RSI / MACD / 布林带 / ATR 四项技术指标, 并以 Jupyter Notebook 形式呈现完整计算过程
> 上游依赖: task01 的 `stock_data_spec.md` 产出的日线 CSV
> 维护方式: 修改本文件即生效, notebook 实现以本 spec 为唯一约定来源

---

## 0. 任务目标

### 0.1 核心目标
用长川科技 (300604.SZ) 近一年日线数据计算 4 项技术指标, **以 Jupyter Notebook 为载体**, 将"指标含义 → 数学公式 → 代码实现 → 结果可视化"完整呈现为一份可读、可复现的实验文档。

### 0.2 为什么用 Notebook
- **教学性**: 每个指标前用 Markdown cell 写含义, 公式, 参数理由, 让计算过程"可解释"。
- **可追溯**: cell 顺序即计算顺序, 任何人按 Run All 即可复现全部结果。
- **可迭代**: 调整参数只改 config cell, 其余不动。

### 0.3 不做什么 (Out of scope)
- 不做交易策略回测 (那是 task03 的事)。
- 不做买卖信号生成, 只做指标计算与可视化。
- 不接入实时行情, 只用本地 CSV 静态数据。
- 不做多标的对比, 本任务只算长川科技一只。

---

## 1. 输入数据契约

### 1.1 数据源
| 项 | 值 |
|----|----|
| 文件路径 | `data/processed/300604.SZ_daily_20250718_20260718.csv` (项目根) |
| 相对路径 (notebook 在 notebooks/ 子目录执行) | `../../data/processed/300604.SZ_daily_20250718_20260718.csv` |
| 编码 | utf-8-sig (含 BOM) |
| 分隔符 | 逗号 |

### 1.2 字段 Schema
| 字段 | 类型 | 单位 | 用途 |
|------|------|------|------|
| ts_code | str | — | 股票代码, 固定 300604.SZ |
| trade_date | str(YYYYMMDD) | — | 交易日, 需转 datetime |
| open | float | 元 | 开盘价 |
| high | float | 元 | 最高价 (ATR/TR 用) |
| low | float | 元 | 最低价 (ATR/TR 用) |
| close | float | 元 | 收盘价 (RSI/MACD/布林带 主输入) |
| pre_close | float | 元 | 昨收 (ATR/TR 用) |
| change | float | 元 | 涨跌额 |
| pct_chg | float | % | 涨跌幅 |
| vol | float | 手 | 成交量 |
| amount | float | 千元 | 成交额 |

### 1.3 数据范围
- 日期: 2025-07-18 ~ 2026-07-17
- 行数: 242 (含 header 共 243 行)
- 已校验通过 (task01 metadata validation: PASS)

### 1.4 数据加载要求
- 读入后 `trade_date` 列转为 `datetime64[ns]`, 设为 index 并按升序排列。
- 数值列强制 `float64`。
- 校验: 行数 ≥ 60 (保证 warmup 后有足够样本); `close` 无负值与 NaN。
- **预热期 (warmup) 处理 (见决策 D4)**: 指标前若干行为 NaN 属正常, **保留 NaN 不填 0 也不前向填充**, 让"数据从第几行开始有效"这件事可见。下游绘图自动跳过 NaN。

---

## 2. 指标定义与公式

四个指标的选择理由: 覆盖 **动量 (RSI)、趋势+动量 (MACD)、波动率通道 (布林带)、纯波动率 (ATR)** 四个维度, 互补不冗余。

### 2.1 RSI — 相对强弱指数

| 项 | 值 |
|----|----|
| 类型 | 动量振荡器 |
| 默认参数 | period = 14 |
| 平滑方式 | Wilder smoothing (EMA, α=1/period) |

**计算步骤:**
1. 日收益变动 ΔP = close_t − close_{t-1}
2. 涨幅 gain_t = max(ΔP, 0); 跌幅 loss_t = max(−ΔP, 0)
3. 首次平均: avg_gain = mean(gains[:14]); avg_loss = mean(losses[:14])
4. Wilder 递推:
   - avg_gain_t = (avg_gain_{t-1} × 13 + gain_t) / 14
   - avg_loss_t = (avg_loss_{t-1} × 13 + loss_t) / 14
5. RS_t = avg_gain_t / avg_loss_t
6. RSI_t = 100 − 100 / (1 + RS_t)

**pandas 实现 (见决策 D2):**
- Wilder smoothing 等价于 `ewm(alpha=1/period, adjust=False)`
- **不用** `ewm(span=period)` —— 虽然 `span=N` 与 `alpha=2/(N+1)` 在数学上等价, 但教学上用 `alpha=1/N` 直接看清"Wilder 的衰减系数是 1/周期", 避免与 MACD 的 EMA(span=N, α=2/(N+1)) 混淆。

**输出列:** `rsi_14`

**参数说明:**
- `period` 可配, 短线常用 6/9, 中线 14, 长线 24。
- 当 avg_loss = 0 时 RSI = 100 (全涨无跌)。

### 2.2 MACD — 平滑异同移动平均线

| 项 | 值 |
|----|----|
| 类型 | 趋势 + 动量 |
| 默认参数 | fast=12, slow=26, signal=9 |
| 平滑方式 | EMA |

**计算步骤:**
1. EMA_fast = EMA(close, 12)
2. EMA_slow = EMA(close, 26)
3. DIF (快线) = EMA_fast − EMA_slow
4. DEA (慢线/信号线) = EMA(DIF, 9)
5. MACD_hist (柱) = DIF − DEA   ← **课程默认不乘 2** (与产品 spec 对齐, 见第 13 节决策 D1)

**EMA 递推公式:**
- 首值 = 序列首个值 (与 pandas `ewm(adjust=False)` 一致)
- EMA_t = EMA_{t-1} + α × (price_t − EMA_{t-1}), 其中 α = 2 / (N + 1)
- pandas 写法: `series.ewm(span=N, adjust=False).mean()` 等价于 `ewm(alpha=2/(N+1), adjust=False)`

**输出列:** `macd_dif`, `macd_dea`, `macd_hist`

### 2.3 布林带 — Bollinger Bands

| 项 | 值 |
|----|----|
| 类型 | 波动率通道 |
| 默认参数 | window=20, num_std=2 |
| 平滑方式 | 简单移动平均 (SMA) + 总体标准差 |

**计算步骤:**
1. 中轨 BB_mid = SMA(close, 20)
2. 滚动标准差 σ = std(close, 20), **ddof=0 (总体标准差, 见决策 D3)**
3. 上轨 BB_upper = BB_mid + 2 × σ
4. 下轨 BB_lower = BB_mid − 2 × σ
5. 带宽 BB_width = (BB_upper − BB_lower) / BB_mid
6. %B = (close − BB_lower) / (BB_upper − BB_lower)

**pandas 写法:** `close.rolling(20).std(ddof=0)` (默认 ddof=1 会偏大, 与布林带原版不符)

**输出列:** `bb_mid`, `bb_upper`, `bb_lower`, `bb_width`, `bb_pct_b`

**参数说明:**
- `num_std` 越大通道越宽, 触轨信号越少但越可靠。
- %B > 1 表示价在上轨之外; < 0 表示在下轨之外。

### 2.4 ATR — 真实波动幅度均值

| 项 | 值 |
|----|----|
| 类型 | 纯波动率 |
| 默认参数 | period=14 |
| 平滑方式 | Wilder smoothing (与 RSI 一致) |

**计算步骤:**
1. 真实波幅 TR_t = max(三者):
   - 当日振幅: high_t − low_t
   - 跳空高开: |high_t − pre_close_{t-1}|
   - 跳空低开: |low_t − pre_close_{t-1}|
2. 首次 ATR = mean(TR[1:15]) (首日 TR 无前收, 用 high−low)
3. Wilder 递推: ATR_t = (ATR_{t-1} × 13 + TR_t) / 14

**pandas 实现:** 与 RSI 一致用 `ewm(alpha=1/period, adjust=False)` (见决策 D2)

**输出列:** `tr`, `atr_14`

**用途提示 (notebook 中说明, 不实现):**
- 止损距离常设 1.5~3 × ATR
- 仓位 = 单笔风险金额 / (ATR × 倍数)

---

## 3. Notebook 结构规范

Notebook 文件名: `indicator_lab_changchuan.ipynb`, 存于 `notebooks/`。

按以下 cell 顺序组织, Markdown cell 与 Code cell 交替, 每个 Code cell 上方必须有说明该 cell 做什么的 Markdown。

### Cell 1 — Config (Code)
```python
# 全局配置, 调参只改这里
PARAMS = {
    "rsi_period": 14,
    "macd_fast": 12, "macd_slow": 26, "macd_signal": 9,
    "bb_window": 20, "bb_std": 2,
    "atr_period": 14,
}
DATA_PATH = "../../data/processed/300604.SZ_daily_20250718_20260718.csv"
OUTPUT_DIR = "../outputs"
CHART_DIR = "../charts"
```

### Cell 2 — 环境与依赖导入 (Markdown + Code)
- Markdown: 列出依赖 (pandas, numpy, matplotlib), 说明 matplotlib 中文字体配置。
- Code: import, 设置中文字体, 设置 涨红跌绿 色板, `%matplotlib inline`。

### Cell 3 — 数据加载与预览 (Markdown + Code)
- Markdown: 说明数据来源 (task01 产出), 字段含义。
- Code: 读取 CSV, 转日期, 设 index, 升序, `df.head()`, `df.info()`, `df.describe()`。

### Cell 4 — 数据质量检查 (Markdown + Code)
- Markdown: 说明检查项 (行数, 缺失, 价格关系)。
- Code: 断言 high ≥ low ≥ 0; close 无 NaN; 行数 ≥ 60; 画 close 走势图预览。

### Cell 5 — RSI 计算 (Markdown + 公式 + Code + 预览)
- Markdown: RSI 含义 + 上面 2.1 的公式 (用 LaTeX) + 参数理由。
- Code: 实现 Wilder smoothing, 加 `rsi_14` 列, `df[["close","rsi_14"]].tail()` 预览。
- Code: 画 RSI 图 (价格上图 + RSI 下图, 30/70 横线)。

### Cell 6 — MACD 计算 (Markdown + 公式 + Code + 预览)
- Markdown: MACD 含义 + 2.2 公式 + 金叉死叉说明。
- Code: 实现 EMA/DIF/DEA/hist, 加列, 预览。
- Code: 画 MACD 图 (价格上图 + DIF/DEA 下图 + hist 柱)。

### Cell 7 — 布林带计算 (Markdown + 公式 + Code + 预览)
- Markdown: 布林带含义 + 2.3 公式 + 收口含义。
- Code: 实现 mid/upper/lower/width/%B, 加列, 预览。
- Code: 画布林带图 (价格 + 三轨 + 填充带)。

### Cell 8 — ATR 计算 (Markdown + 公式 + Code + 预览)
- Markdown: ATR 含义 + 2.4 公式 + TR 三种情形 + 风控用途。
- Code: 实现 TR/ATR, 加列, 预览。
- Code: 画 ATR 图 (价格上图 + ATR 下图)。

### Cell 9 — 综合可视化 (Markdown + Code)
- Markdown: 四指标横向对比说明。
- Code: 2×2 子图, 分别画 RSI/MACD/布林带/ATR, 共享时间轴。保存 PNG 到 `charts/`。

### Cell 10 — 输出保存 (Markdown + Code)
- Markdown: 说明输出文件。
- Code: 把含全部指标列的 DataFrame 存为 `outputs/changchuan_indicators.csv`, 打印 schema。

---

## 4. 输出 Schema

### 4.1 指标表 CSV: `outputs/changchuan_indicators.csv`

| 列名 | 类型 | 说明 |
|------|------|------|
| trade_date | str(YYYYMMDD) | 交易日 (index 还原) |
| open/high/low/close | float | 原始行情 (保留) |
| pct_chg | float | 原始涨跌幅 (保留) |
| rsi_14 | float | RSI, 0~100 |
| macd_dif | float | MACD 快线 |
| macd_dea | float | MACD 慢线 |
| macd_hist | float | MACD 柱 |
| bb_mid | float | 布林中轨 |
| bb_upper | float | 布林上轨 |
| bb_lower | float | 布林下轨 |
| bb_width | float | 布林带宽 |
| bb_pct_b | float | %B 位置 |
| tr | float | 真实波幅 |
| atr_14 | float | ATR |

### 4.2 图表文件: `charts/`
| 文件 | 内容 |
|------|------|
| `01_rsi.png` | 价格 + RSI 双子图 |
| `02_macd.png` | 价格 + DIF/DEA/hist 子图 |
| `03_bollinger.png` | 价格 + 三轨填充 |
| `04_atr.png` | 价格 + ATR 子图 |
| `05_overview.png` | 四指标 2×2 综合图 |

---

## 5. 可视化规范

- **A股惯例**: 涨红跌绿。MACD 柱: 正值红色 `#D85A30`, 负值绿色 `#1D9E75`。
- **中文字体**: matplotlib 设置 `plt.rcParams['font.sans-serif']=['Arial Unicode MS']` (macOS) 或 `SimHei`。
- **背景**: 浅色 (`#F1EFE8` 或白色), 网格淡灰。
- **标题**: 每图标题含股票名 + 指标名 + 参数, 如 `长川科技 RSI(14)`。
- **图例**: 右上, 12px。
- **DPI**: 保存 PNG 用 150。

---

## 6. 依赖清单

| 包 | 版本 | 用途 |
|----|------|------|
| pandas | ≥2.0 | 数据处理 |
| numpy | ≥1.24 | 数值计算 |
| matplotlib | ≥3.7 | 可视化 |
| jupyter | ≥7.0 | notebook 运行环境 |

> 不依赖 talib (安装麻烦, 本任务手写实现以体现计算过程)。如已装 talib 可在对比 cell 验证。

---

## 7. 验收标准

| 编号 | 标准 | 验证方式 |
|------|------|---------|
| A1 | Notebook 可从头到尾无错运行 | Run All 不报错 |
| A2 | 指标列 warmup 期后无 NaN, warmup 期内允许且应保留 NaN | `df.isna().sum()` 分段检查 |
| A3 | RSI 全部落在 [0, 100] | `assert df.rsi_14.between(0,100).all()` |
| A4 | ATR 全部 ≥ 0 | `assert (df.atr_14 >= 0).all()` |
| A5 | 布林带 upper ≥ mid ≥ lower | `assert (bb_upper >= bb_mid).all()` |
| A6 | MACD hist = DIF − DEA (不乘 2, 见 D1) 容差 1e-6 | 数值比对 |
| A7 | 输出 CSV 行数 = 输入行数 | 242 行 |
| A8 | 5 张 PNG 图表均生成 | 文件存在检查 |
| A9 | 中文正常显示无方框 | 肉眼检查 |

---

## 8. 目录结构

```
task02_indicator_lab/
├── indicator_lab_spec.md      # 本规范文件
├── notebooks/
│   └── indicator_lab_changchuan.ipynb   # 主 notebook (待实现)
├── outputs/
│   └── changchuan_indicators.csv       # 指标表 (待生成)
├── charts/
│   ├── 01_rsi.png                      # (待生成)
│   ├── 02_macd.png
│   ├── 03_bollinger.png
│   ├── 04_atr.png
│   └── 05_overview.png
└── data/                               # 软链接或复制 (可选)
```

> 输入数据通过相对路径 `../../data/processed/300604.SZ_daily_20250718_20260718.csv` 引用 (notebook 在 notebooks/ 子目录执行), 不复制, 避免重复。

---

## 9. 错误处理与边界

| 情况 | 处理 |
|------|------|
| CSV 读取失败 | 抛 FileNotFoundError, 提示先跑 task01 取数 |
| 行数 < max(period)+5 | 抛 ValueError, 说明数据不足以算指标 |
| close 含 NaN | 原始数据 NaN 抛错; 指标 warmup 产生的 NaN **保留** (见 D4) |
| RSI avg_loss=0 | RSI = 100, 不报错 |
| EMA 首值 | 用序列首值, `ewm(adjust=False)` (与 D2 一致) |

---

## 10. 机器可读配置块 (YAML)

```yaml
task: "task02_indicator_lab"
spec_version: "1.0"
created: "2026-07-18"
upstream: "task01/stock_data_spec.md"

input:
  data_path: "../../data/processed/300604.SZ_daily_20250718_20260718.csv"
  ts_code: "300604.SZ"
  name: "长川科技"
  encoding: "utf-8-sig"
  date_col: "trade_date"
  date_format: "%Y%m%d"
  price_cols: [open, high, low, close, pre_close]
  min_rows: 60

indicators:
  - name: rsi
    class: "momentum_oscillator"
    params: {period: 14}
    smoothing: "wilder"
    output_cols: [rsi_14]
    value_range: [0, 100]
  - name: macd
    class: "trend_momentum"
    params: {fast: 12, slow: 26, signal: 9}
    smoothing: "ema"
    output_cols: [macd_dif, macd_dea, macd_hist]
  - name: bollinger
    class: "volatility_channel"
    params: {window: 20, num_std: 2}
    smoothing: "sma"
    output_cols: [bb_mid, bb_upper, bb_lower, bb_width, bb_pct_b]
  - name: atr
    class: "volatility"
    params: {period: 14}
    smoothing: "wilder"
    output_cols: [tr, atr_14]
    value_range: [0, null]

notebook:
  filename: "indicator_lab_changchuan.ipynb"
  location: "notebooks/"
  kernel: "python3"
  cell_order:
    - config
    - imports
    - data_load
    - data_quality
    - rsi_calc
    - macd_calc
    - bollinger_calc
    - atr_calc
    - overview_viz
    - output_save

output:
  csv: "outputs/changchuan_indicators.csv"
  charts:
    - {file: "charts/01_rsi.png", desc: "价格 + RSI"}
    - {file: "charts/02_macd.png", desc: "价格 + MACD"}
    - {file: "charts/03_bollinger.png", desc: "价格 + 布林带"}
    - {file: "charts/04_atr.png", desc: "价格 + ATR"}
    - {file: "charts/05_overview.png", desc: "四指标综合"}

visualization:
  convention: "cn_stock"  # 涨红跌绿
  up_color: "#D85A30"
  down_color: "#1D9E75"
  font: "Arial Unicode MS"
  background: "#F1EFE8"
  dpi: 150

dependencies:
  - {pkg: pandas, version: ">=2.0"}
  - {pkg: numpy, version: ">=1.24"}
  - {pkg: matplotlib, version: ">=3.7"}
  - {pkg: jupyter, version: ">=7.0"}

acceptance:
  - id: A1
    desc: "Notebook Run All 无错"
  - id: A2
    desc: "warmup 后无 NaN, warmup 内保留 NaN"
  - id: A3
    desc: "RSI in [0,100]"
  - id: A4
    desc: "ATR >= 0"
  - id: A5
    desc: "bb_upper >= bb_mid >= bb_lower"
  - id: A6
    desc: "macd_hist = dif-dea (不乘2) 容差1e-6"
  - id: A7
    desc: "输出行数 = 输入行数"
  - id: A8
    desc: "5张PNG均生成"
  - id: A9
    desc: "中文显示正常"

design_decisions:
  - id: D1
    name: "MACD hist 不乘 2"
    rationale: "与课程产品 spec 对齐, hist = DIF - DEA"
  - id: D2
    name: "Wilder smoothing 用 ewm(alpha=1/n)"
    rationale: "等价于 ewm(span=N) 但 alpha 直观显示衰减系数, 避免与 MACD EMA 混淆"
  - id: D3
    name: "布林带 ddof=0"
    rationale: "总体标准差, 与 Bollinger 原版一致"
  - id: D4
    name: "warmup 保留 NaN"
    rationale: "不填 0 不 ffill, 让有效起点可见"
```

---

## 11. 与 task01 的衔接

- 本任务**只消费** task01 产出的 `data/processed/300604.SZ_daily_*.csv`, 不重新取数。
- 若输入文件不存在, notebook 应提示: "请先运行 task01 的 `fetch_stock_data.py` 取数"。
- 指标表输出 `outputs/changchuan_indicators.csv` 可作为 task03 (策略回测) 的输入。

---

## 12. 关键设计决策 (Design Decisions)

以下四项决策是本 spec 的核心约定, notebook 实现必须严格遵守, 并在对应 cell 的 Markdown 中向学生讲清"为什么这么做"。

### D1 — MACD 柱不乘 2
- **约定**: `macd_hist = DIF − DEA` (不乘 2)
- **理由**: 与课程产品 spec 对齐。经典文献中 MACD 柱常写成 `2 × (DIF − DEA)`, 但乘 2 只是把柱的视觉高度放大一倍, 不改变过零点的位置和金叉/死叉的判断。为避免学生在不同教材里看到不同系数产生困惑, 本课程统一**不乘 2**。
- **影响**: 验收 A6 改为 `hist = DIF − DEA`; 画图时柱的量纲与 DIF/DEA 一致, 三者可直接同图比较。
- **实现提示**: 代码里直接 `df["macd_hist"] = df["macd_dif"] - df["macd_dea"]`, 不要写 `2 *`。

### D2 — Wilder smoothing 用 `ewm(alpha=1/n)`
- **约定**: RSI 和 ATR 的 Wilder 平滑统一用 `series.ewm(alpha=1/period, adjust=False).mean()`
- **理由**:
  - Wilder 原始递推 `X_t = (X_{t-1} × (n−1) + 当前值) / n` 的衰减系数就是 `α = 1/n`。
  - pandas 的 `ewm(span=N)` 实际等价于 `α = 2/(N+1)`, 只有当 `span=N` 且想让 α=1/n 时需用 `span = 2n − 1` —— 容易写错。
  - **直接用 `alpha=1/n` 让学生一眼看清"Wilder 的衰减速度是每期保留 (n−1)/n"**, 而不用绕 span 换算。
  - 同时避免与 MACD 的 EMA(用 `span=N`, α=2/(N+1)) 混淆 —— 两种平滑在概念上是不同的。
- **等价性说明 (notebook 中写明)**: 对 RSI 而言, `ewm(alpha=1/14)` ≈ Wilder 递推; 严格 Wilder 用首值=SMA 且递推, pandas `ewm(adjust=False)` 用首值=序列首值, 二者在长序列上几乎无差别, 教学场景可接受。
- **影响**: RSI 和 ATR 的实现代码统一用 `alpha` 参数; MACD 的 EMA 仍用 `span` 参数。

### D3 — 布林带用 ddof=0 (总体标准差)
- **约定**: `σ = close.rolling(20).std(ddof=0)`
- **理由**:
  - Bollinger 原版用总体标准差 (population std), 即除以 N 而非 N−1。
  - pandas `.std()` 默认 `ddof=1` (样本标准差), 会比原版略大, 通道偏宽。
  - 虽然差异在 N=20 时很小, 但对齐原版可避免与 talib / 交易软件的结果出现"说不清的小偏差"。
- **影响**: 上轨略低、下轨略高 (相比 ddof=1); 验收 A5 不受影响 (有序性不变)。
- **实现提示**: `df["bb_mid"] = close.rolling(20).mean(); sigma = close.rolling(20).std(ddof=0)`。

### D4 — 预热期保留 NaN
- **约定**: 指标计算产生的 warmup 期 NaN (RSI/ATR 前 14 行、MACD 前 26 行、布林带前 20 行) **一律保留**, 不填 0、不前向填充、不 dropna。
- **理由**:
  - warmup 期的指标值在数学上无定义 (样本不足), 填 0 会误导"指标为零", ffill 会把首个有效值前移、制造假信号。
  - **保留 NaN 让"数据从第几行开始有效"这件事对读者可见** —— 这是教学场景的重要原则。
  - 下游 matplotlib 自动跳过 NaN 绘图, 不影响可视化; 下游策略回测若用到指标需自行 dropna。
- **影响**:
  - 输出 CSV 的前若干行指标列是空的 (这是正确的)。
  - 验收 A2 改为分段检查: warmup 期内允许 NaN, warmup 期后应无 NaN。
  - 验收 A7 (行数 = 输入行数) 不受影响 —— 不删行, 只留空。

### 决策汇总表

| 编号 | 决策 | 关键写法 | 影响指标 |
|------|------|---------|---------|
| D1 | MACD 柱不乘 2 | `hist = DIF - DEA` | MACD |
| D2 | Wilder 用 alpha | `ewm(alpha=1/n, adjust=False)` | RSI, ATR |
| D3 | 布林带 ddof=0 | `rolling(20).std(ddof=0)` | 布林带 |
| D4 | warmup 保留 NaN | 不填 0 / 不 ffill / 不 dropna | 全部 |

---

## 13. 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-07-18 | 初版: 定义 4 指标公式、notebook 10-cell 结构、输出 schema、验收标准、YAML 配置 |
| 1.1 | 2026-07-18 | 新增第 12 节关键设计决策 D1-D4: MACD 柱不乘2、Wilder 用 ewm(alpha=1/n)、布林带 ddof=0、warmup 保留 NaN; 同步更新公式、验收标准、YAML 配置 |
| 1.2 | 2026-07-18 | 实现 notebook 通过验收 (Run All 无错, A1-A8 全 PASS); 修正 RSI 首行被错误填 100 的 bug (avg_loss 为 NaN 时不应替换); 修正输入数据相对路径为 ../../data/processed/ |
