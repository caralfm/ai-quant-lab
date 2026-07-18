# 股票取数规范 (Stock Data Fetching Spec)

> 版本: v1.0 · 生成日期: 2026-07-18
> 适用范围: A股个股多品种数据获取与规范化存储
> 维护方式: 修改本文件即生效，所有取数脚本以本 spec 为唯一约定来源

---

## 0. 设计原则

- **单一事实来源**: 标的清单、字段定义、命名规则只在 spec 中定义一次，脚本读取 spec 执行。
- **可追溯**: 每份数据附带 metadata（拉取时间、源、参数、行数），保证可复现。
- **可复用**: spec 不绑定具体标的，新增股票只需在 `universe` 段追加一行。
- **降级容错**: 主数据源失败时按优先级自动降级到备选源，并记录降级标记。
- **A股惯例**: 涨红跌绿；价格单位元；成交量单位手；金额单位千元。

---

## 1. 标的清单 (Universe)

| 代码 | 名称 | 市场 | 行业 | 产业链角色 | 备注 |
|------|------|------|------|-----------|------|
| 300604.SZ | 长川科技 | 创业板 | 半导体测试设备 | 中游·设备 | 半导体国产化 |
| 688008.SH | 澜起科技 | 科创板 | 内存接口芯片 | 上游·芯片设计 | DDR5/AI算力 |
| 000977.SZ | 浪潮信息 | 深主板 | 服务器/算力 | 下游·算力 | AI服务器龙头 |

> 三者构成"AI算力/半导体产业链"代表性样本：芯片设计 → 设备 → 服务器。

---

## 2. 数据集与字段 Schema

每个数据集 (dataset) 对应一个 Tushare 接口，字段定义标准化。`required=true` 字段缺失即判该校验失败。

### 2.1 daily — 日线行情 (前复权)
| 字段 | 类型 | 单位 | 说明 |
|------|------|------|------|
| ts_code | str | — | 股票代码 |
| trade_date | str(YYYYMMDD) | — | 交易日 |
| open / high / low / close | float | 元 | 开高低收 |
| pre_close | float | 元 | 昨收 |
| change | float | 元 | 涨跌额 |
| pct_chg | float | % | 涨跌幅 (保留2位) |
| vol | float | 手 | 成交量 |
| amount | float | 千元 | 成交额 |

### 2.2 adj_factor — 复权因子
ts_code · trade_date · adj_factor

### 2.3 daily_basic — 每日指标
ts_code · trade_date · turnover_rate · turnover_rate_f · volume_ratio · pe · pe_ttm · pb · ps · ps_ttm · dv_ratio · dv_ttm · total_mv · circ_mv

### 2.4 moneyflow — 个股资金流向
ts_code · trade_date · buy_sm_amount · sell_sm_amount · buy_md_amount · sell_md_amount · buy_lg_amount · sell_lg_amount · net_mf_amount

### 2.5 stock_basic — 股票基本信息
ts_code · symbol · name · area · industry · fullname · market · list_date

### 2.6 trade_cal — 交易日历
cal_date · is_open · pretrade_date

> 财务数据 (income/balancesheet/cashflow)、龙虎榜 (top_list)、解禁 (share_float) 为扩展数据集，spec 默认不拉取，按需在 `datasets` 配置中开启。

---

## 3. 数据源与优先级

| 优先级 | 数据源 | 接入方式 | 适用数据集 |
|--------|--------|---------|-----------|
| P0 | Tushare REST API | POST https://api.tushare.pro (api_name/token/params/fields) | daily, daily_basic, adj_factor, stock_basic, trade_cal |
| P1 | 新浪财经 API | HTTP (money.finance.sina.com.cn) | 仅 daily OHLCV |
| P2 | 本地缓存 | data/processed/ | 降级兜底 |

- 默认使用 P0；P0 失败（超时/无权限/限频）自动尝试 P1（仅行情）。
- 降级发生时在 metadata `fallback` 字段记录源，并在日志中 WARNING。
- 代理: 直连 `api.tushare.pro` 默认可达；如需代理从环境变量 `HTTP_PROXY`/`HTTPS_PROXY` 读取，不硬编码。

### 3.1 当前 token 权限实测 (2026-07-18)
| 接口 | 状态 | 说明 |
|------|------|------|
| daily | ✅ 可用 | 日线 OHLCV |
| daily_basic | ✅ 可用 | PE/PB/市值/换手率 |
| adj_factor | ✅ 可用 | 复权因子 |
| stock_basic | ✅ 可用 | 股票基本信息 |
| trade_cal | ✅ 可用 | 交易日历 |
| moneyflow | ❌ 40203 | 需更高积分，spec 中标记为不可用 |

---

## 4. 日期范围约定

- **默认时间窗**: 滚动近一年 (trailing 365 天)，end_date = 当日，start_date = end_date - 365 天。
- **交易日过滤**: 用 `trade_cal` 校验 end_date 是否为交易日；非交易日顺延到前一交易日。
- **日期格式**: 对外接口与文件名统一 `YYYYMMDD`；CSV 内 `trade_date` 列也用 `YYYYMMDD`。
- **可配置**: `date_range` 段支持 `mode: trailing | fixed | ytd`。

---

## 5. 存储与命名规范

### 5.1 目录结构
```
/Users/cara/Documents/量化/
├── stock_data_spec.md          # 本规范文件
├── data/
│   ├── universe/               # 标的清单 (stocks.yaml)
│   ├── raw/                    # 原始返回 (按数据集分子目录)
│   │   ├── daily/
│   │   ├── adj_factor/
│   │   └── daily_basic/
│   ├── processed/              # 清洗校验后 CSV
│   └── metadata/               # 每个数据文件对应一个 .json
├── scripts/                    # 取数脚本
└── reports/                    # 面板/报告输出
```

### 5.2 文件命名
`{ts_code}_{dataset}_{start_date}_{end_date}.csv`
示例: `300604.SZ_daily_20250718_20260718.csv`

- metadata 同名 `.json`，与数据文件成对存放。
- raw 层保留原始接口返回（含全部字段，不删列）；processed 层只保留 spec 定义字段。

---

## 6. 数据校验规则

拉取后逐项校验，任一失败则在 metadata 标 `validation: FAIL` 并不写入 processed。

| 校验项 | 规则 | 容差 |
|--------|------|------|
| 行数 | 交易日数 ≈ trade_cal 统计 | ±2 行 |
| 连续性 | trade_date 序列与交易日历一致 | 缺失 ≤ 3 日告警 |
| 价格区间 | 0 < low ≤ open,close ≤ high | 0 容差 |
| 非负 | vol ≥ 0, amount ≥ 0 | 0 容差 |
| 涨跌幅一致性 | \|pct_chg - 实算\| < 0.05% | 0.05% |
| 复权一致性 | adj_factor 单调非降 (分红除权日跳变除外) | — |
| 跨源比对 | P0 与 P1 收盘价差异 | < 0.01 元 |

---

## 7. 增量更新

1. 读取已有 processed CSV 的最大 trade_date → `last_date`。
2. start_date = last_date + 1 交易日；end_date = 当日。
3. 增量拉取后与历史拼接，按 trade_date 去重保留最新。
4. 若距 last_date 超过 30 个交易日，触发全量重拉并告警。
5. 每次更新在 metadata 追加 `update_history` 条目。

---

## 8. 元数据 (Metadata)

每个 processed 数据文件配一份 `{同名}.json`：
```json
{
  "ts_code": "300604.SZ",
  "dataset": "daily",
  "source": "tushare_mcp",
  "fallback": null,
  "fetch_time": "2026-07-18T17:00:00+08:00",
  "params": {"start_date": "20250718", "end_date": "20260718"},
  "row_count": 243,
  "date_range": ["20250718", "20260718"],
  "validation": "PASS",
  "schema_version": "1.0",
  "spec_version": "1.0",
  "update_history": []
}
```

---

## 9. 执行流程 (Workflow)

```
1. 加载 spec + universe
2. 校验标的存在 (stock_basic)
3. 取交易日历 (trade_cal)，确定实际 start/end
4. for each ts_code in universe:
     for each dataset in datasets:
       a. 查本地缓存决定全量/增量
       b. 按 P0→P1→P2 优先级拉取
       c. 字段对齐 + 类型转换
       d. 执行校验 (第6节)
       e. 通过→写 processed + metadata；失败→记错并继续
5. 汇总运行报告 (成功/失败/降级/行数)
6. (可选) 触发面板生成
```

---

## 10. 错误与重试

- 单次请求超时 60s，重试 2 次（指数退避 2s/4s）。
- 限频 (Tushare 40203): 按提示等待后重试，最多 3 轮。
- 单标的单数据集失败不中断整体流程，记入报告。
- 连续 3 次 schema 校验失败 → 停止该数据集并人工介入。

### 10.1 实测限频 (120 积分档, 2026-07-18)
| 接口 | 限频 | 策略 |
|------|------|------|
| daily | 500次/天 | 宽松, 逐只调用即可 |
| daily_basic | 1次/小时 | **必须 multi_code 批量调用** (3只1次取完) |
| adj_factor | 1次/小时 | **必须 multi_code 批量调用** |
| stock_basic | 200次/分钟 | 宽松 |
| trade_cal | 200次/分钟 | 宽松 |
| moneyflow | 无权限(40203) | 跳过 |

> ⚠️ 关键约束: daily_basic 和 adj_factor 每小时仅能调用 1 次。
> 3 只股票必须用 `ts_code="300604.SZ,688008.SH,000977.SZ"` 逗号分隔
> 在单次请求中全部取回, 否则需等 3 小时。
> 脚本已实现 `fetch_multi()` 自动批量调用。

---

## 11. 机器可读配置块 (YAML)

```yaml
spec_version: "1.0"
universe:
  - ts_code: "300604.SZ"
    name: "长川科技"
    sector: "半导体测试设备"
    chain_role: "midstream_device"
  - ts_code: "688008.SH"
    name: "澜起科技"
    sector: "内存接口芯片"
    chain_role: "upstream_chip"
  - ts_code: "000977.SZ"
    name: "浪潮信息"
    sector: "服务器/算力"
    chain_role: "downstream_compute"

datasets:
  - name: daily
    tool: "tushare_rest:daily"
    required: true
    fields: [ts_code, trade_date, open, high, low, close, pre_close, change, pct_chg, vol, amount]
  - name: adj_factor
    tool: "tushare_rest:adj_factor"
    required: true
    fields: [ts_code, trade_date, adj_factor]
  - name: daily_basic
    tool: "tushare_rest:daily_basic"
    required: false
    fields: [ts_code, trade_date, turnover_rate, pe, pe_ttm, pb, total_mv, circ_mv]
  - name: moneyflow
    tool: "tushare_rest:moneyflow"
    required: false
    available: false
    note: "token 积分不足(40203), spec 中标记为不可用, 跳过"
    fields: [ts_code, trade_date, net_mf_amount, buy_lg_amount, sell_lg_amount]

sources:
  - priority: 0
    name: "tushare_rest"
    type: "http"
    url: "https://api.tushare.pro"
    token_env: "TUSHARE_TOKEN"
    method: "POST"
    payload: {"api_name": "{dataset}", "token": "{token}", "params": "{params}", "fields": "{fields}"}
  - priority: 1
    name: "sina"
    type: "http"
    url: "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData"
    datasets: ["daily"]

date_range:
  mode: "trailing"
  days: 365

storage:
  root: "/Users/cara/Documents/量化"
  subdirs: [data/raw, data/processed, data/metadata, data/universe, reports]
  naming: "{ts_code}_{dataset}_{start_date}_{end_date}.csv"
  encoding: "utf-8-sig"

validation:
  trading_day_tolerance: 2
  pct_chg_tolerance: 0.05
  cross_source_close_diff: 0.01

retry:
  timeout_sec: 60
  max_retries: 2
  backoff: [2, 4]
  rate_limit_max_rounds: 3
```

---

## 12. 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-07-18 | 初版：定义 universe、5 个数据集 schema、双数据源、校验与增量规则 |
| 1.1 | 2026-07-18 | 修正数据源: P0 改为 Tushare 直连 REST API (MCP 封装有兼容问题); 实测 token 权限与限频; daily_basic/adj_factor 改为 multi_code 批量调用; moneyflow 标记不可用 |
