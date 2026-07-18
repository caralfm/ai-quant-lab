# AI Quant Lab

A股技术指标交互式实验室 — 选股、算指标、调参数、实时重绘。

## 项目概览

本项目以 **长川科技 (300604.SZ)、澜起科技 (688008.SH)、浪潮信息 (000977.SZ)** 三只 AI算力/半导体产业链股票为样本，构建了一套从数据采集到指标计算到交互式可视化的完整工具链。

### 核心交付物

| 模块 | 说明 | 路径 |
|------|------|------|
| 交互式指标工具 | 纯浏览器端 SPA，选股+调参+实时重绘 | `interactive_tool/` |
| 指标计算 Notebook | RSI/MACD/布林带/ATR 手写实现，含教学讲解 | `notebooks/` |
| 取数脚本 | Tushare REST API 批量取数，含降级与校验 | `scripts/` |
| 规范文档 | 取数规范 + 指标规范 + 工具设计规范 | `specs/` |
| 数值验证 | 工具算法与 Notebook CSV 逐点比对 (容差 1e-6) | `tests/` |

## 快速开始

### 方式一：直接打开（推荐）

双击 `interactive_tool/index.html` 即可在浏览器中使用，无需安装任何依赖。数据已嵌入 `js/data.js`。

### 方式二：本地 HTTP 服务

```bash
cd interactive_tool
python3 -m http.server 8765
# 浏览器访问 http://localhost:8765
```

## 四项技术指标

| 指标 | 类型 | 核心信号 | 默认参数 |
|------|------|---------|---------|
| RSI | 动量振荡器 | >70 超买 / <30 超卖 | period=14 |
| MACD | 趋势+动量 | 金叉/死叉、背离 | 12/26/9 |
| 布林带 | 波动率通道 | 触轨、收口变盘 | period=20, k=2σ |
| ATR | 纯波动率 | 止损距离、仓位 sizing | period=14 |

## 关键设计决策 (D1-D4)

| 编号 | 决策 | 说明 |
|------|------|------|
| D1 | MACD 柱不乘 2 | `hist = DIF - DEA`，与课程产品 spec 对齐 |
| D2 | Wilder 用 `ewm(alpha=1/n)` | 衰减系数 α=1/n，而非 `ewm(span=N)` 的 α=2/(N+1) |
| D3 | 布林带 ddof=0 | 总体标准差，与 Bollinger 原版一致 |
| D4 | warmup 保留 NaN | 不填 0、不前向填充、不 dropna，让数据有效起点可见 |

## 目录结构

```
ai-quant-lab/
├── interactive_tool/        # 交互式 HTML 工具
│   ├── index.html           # 入口（双击即用）
│   ├── css/style.css        # 浅色主题 + A股涨红跌绿
│   └── js/
│       ├── config.js        # 股票清单、默认参数、预设、配色
│       ├── data.js          # 嵌入式数据（3只股票日线 + notebook指标参考值）
│       ├── indicators.js    # 四指标算法（D1-D4 对齐）
│       ├── render.js        # ECharts 渲染层
│       └── app.js           # 状态管理 + 事件绑定
├── notebooks/
│   └── indicator_lab_changchuan.ipynb  # 指标计算教学 notebook
├── data/
│   ├── stocks.yaml          # 标的清单
│   └── processed/           # 3只股票日线 CSV
├── specs/
│   ├── stock_data_spec.md           # 取数规范 (v1.1)
│   ├── indicator_lab_spec.md        # 指标规范 (v1.2)
│   └── interactive_tool_design_spec.md  # 工具设计规范 (v1.0)
├── outputs/
│   └── changchuan_indicators.csv    # 长川科技指标计算结果
├── charts/                  # 5张指标图表 PNG
├── scripts/
│   ├── fetch_stock_data.py  # Tushare 取数脚本
│   ├── build_data.py        # 生成嵌入式 data.js
│   └── build_notebook.py    # 生成 notebook
└── tests/
    └── test_indicators.mjs  # D1-D4 数值验证（1992点比对）
```

## 运行验证

```bash
# 验证工具算法与 notebook 结果一致（容差 1e-6）
node tests/test_indicators.mjs
```

预期输出：1992 点全部通过，D1-D4 特性验证全部通过。

## 技术栈

- **前端**: 原生 JavaScript + ECharts 5（无构建步骤，无框架依赖）
- **计算**: 浏览器端实时计算（<1ms 重算），无后端
- **数据**: Tushare REST API（直连，120积分档）
- **Notebook**: pandas + numpy + matplotlib（手写实现，不依赖 talib）

## 数据源

- Tushare REST API (`https://api.tushare.pro`) — 日线行情、复权因子、每日指标
- 3只股票 × 近一年日线数据（242 个交易日）

## A股配色惯例

涨 → 红色 `#D85A30`，跌 → 绿色 `#1D9E75`（与美股惯例相反）。

## License

MIT
