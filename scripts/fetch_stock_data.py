# -*- coding: utf-8 -*-
"""基于 stock_data_spec.md 的通用取数脚本
读取 data/universe/stocks.yaml, 按 spec 拉取 3 只股票的多数据集数据。
数据源: Tushare REST API (直连), 失败降级到新浪(仅daily)。

用法:
  python fetch_stock_data.py                      # 默认近一年
  python fetch_stock_data.py --start 20240101 --end 20260718
  python fetch_stock_data.py --stocks 300604.SZ,688008.SH
  python fetch_stock_data.py --datasets daily,adj_factor
"""
import os
import csv
import json
import time
import argparse
import requests
from datetime import datetime, timedelta

# ============ 配置 ============
SPEC_VERSION = "1.0"
ROOT = "/Users/cara/Documents/量化"
UNIVERSE_FILE = f"{ROOT}/data/universe/stocks.yaml"
PROCESSED_DIR = f"{ROOT}/data/processed"
RAW_DIR = f"{ROOT}/data/raw"
META_DIR = f"{ROOT}/data/metadata"

TUSHARE_URL = "https://api.tushare.pro"
TOKEN = os.environ.get("TUSHARE_TOKEN", "c74d64d9bfd05534d3d55dbe688b4d089d2cbbe7d293de11f9519cb8")

SINA_URL = "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData"

# 数据集定义 (对应 spec 第2节)
# rate_limit: 该接口在此 token 积分档(120)下的限频
# multi_code: 是否支持单次调用传多个 ts_code (逗号分隔), 用于规避限频
DATASETS = {
    "daily": {
        "api_name": "daily",
        "fields": "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount",
        "sina_compatible": True,
        "rate_limit": "500次/天",
        "multi_code": False,  # daily 限频宽松, 逐只调用即可
    },
    "adj_factor": {
        "api_name": "adj_factor",
        "fields": "ts_code,trade_date,adj_factor",
        "sina_compatible": False,
        "rate_limit": "1次/小时 (120积分档)",
        "multi_code": True,  # 必须批量, 否则 3 只需 3 小时
    },
    "daily_basic": {
        "api_name": "daily_basic",
        "fields": "ts_code,trade_date,turnover_rate,pe,pe_ttm,pb,total_mv,circ_mv",
        "sina_compatible": False,
        "rate_limit": "1次/小时 (120积分档)",
        "multi_code": True,
    },
}

# 代理: 先直连, 失败再试代理
PROXY_FALLBACK = {"http": "http://127.0.0.1:65000", "https": "http://127.0.0.1:65000"}


# ============ 读取 universe ============
def load_universe():
    """简易 YAML 解析 (避免依赖 pyyaml)"""
    stocks = []
    with open(UNIVERSE_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()
    cur = None
    for line in lines:
        s = line.strip()
        if s.startswith("- ts_code:"):
            if cur:
                stocks.append(cur)
            cur = {"ts_code": s.split(":", 1)[1].strip().strip('"')}
        elif cur and ":" in s and not s.startswith("#"):
            k, v = s.split(":", 1)
            cur[k.strip()] = v.strip().strip('"')
    if cur:
        stocks.append(cur)
    return stocks


# ============ Tushare REST API ============
def tushare_call(api_name, params, fields=""):
    payload = {
        "api_name": api_name,
        "token": TOKEN,
        "params": params,
        "fields": fields,
    }
    last_err = None
    for px in [None, PROXY_FALLBACK]:
        try:
            r = requests.post(TUSHARE_URL, json=payload, timeout=60, proxies=px)
            data = r.json()
            data["_source"] = "tushare_rest" + ("+proxy" if px else "")
            return data
        except Exception as e:
            last_err = str(e)
            continue
    return {"_error": last_err}


# ============ 新浪降级 (仅 daily) ============
def sina_fetch(ts_code, datalen=250):
    """新浪仅返回 OHLCV, 无 pre_close/change/amount/pct_chg"""
    code = ts_code.lower().replace(".sz", "").replace(".sh", "")
    prefix = "sz" if "SZ" in ts_code else "sh"
    params = {"symbol": f"{prefix}{code}", "scale": "240", "ma": "no", "datalen": str(datalen)}
    try:
        r = requests.get(SINA_URL, params=params, timeout=30, proxies=PROXY_FALLBACK)
        data = r.json()
        return data, "sina"
    except Exception:
        return None, None


# ============ 取交易日历 ============
def get_trade_cal(start_date, end_date):
    result = tushare_call("trade_cal", {"exchange": "SSE", "start_date": start_date, "end_date": end_date},
                          "cal_date,is_open,pretrade_date")
    if "_error" in result or result.get("code") != 0:
        return []
    items = result["data"].get("items", [])
    fields = result["data"].get("fields", [])
    rows = [dict(zip(fields, it)) for it in items]
    # 按日期升序
    rows.sort(key=lambda x: x["cal_date"])
    return rows


# ============ 写文件 ============
def write_csv(rows, fields, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_meta(meta, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


# ============ 校验 ============
def validate(rows, fields, dataset):
    issues = []
    if not rows:
        issues.append("empty_result")
        return issues
    if dataset == "daily":
        for r in rows:
            try:
                o, h, l, c = float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"])
                if not (0 < l <= o and 0 < l <= c and o <= h and c <= h):
                    issues.append(f"price_range_violation@{r.get('trade_date')}")
                    break
                if float(r.get("vol", 0)) < 0:
                    issues.append(f"negative_vol@{r.get('trade_date')}")
                    break
            except (ValueError, KeyError):
                issues.append(f"type_error@{r.get('trade_date')}")
                break
    # 连续性(允许缺1-2日)
    dates = [r["trade_date"] for r in rows]
    if dates != sorted(dates) or len(set(dates)) != len(dates):
        issues.append("date_not_sorted_or_duplicated")
    return issues


# ============ 主流程 ============
def fetch_one(ts_code, dataset, start_date, end_date):
    """拉取单只股票单个数据集, 返回 (rows, fields, source, fallback_used, issues)"""
    ds = DATASETS[dataset]
    params = {"ts_code": ts_code, "start_date": start_date, "end_date": end_date}
    result = tushare_call(ds["api_name"], params, ds["fields"])
    source = result.get("_source", "tushare_rest")
    fallback = None
    rows, fields = [], []

    if "_error" not in result and result.get("code") == 0:
        data = result.get("data", {})
        fields = data.get("fields", [])
        items = data.get("items", [])
        rows = [dict(zip(fields, it)) for it in items]
        rows.sort(key=lambda x: x["trade_date"])  # Tushare 返回降序, 改为升序
    elif ds["sina_compatible"]:
        # daily 降级到新浪
        sina_data, sina_src = sina_fetch(ts_code)
        if sina_data:
            fallback = "sina"
            source = sina_src
            fields = ["ts_code", "trade_date", "open", "high", "low", "close", "vol"]
            for item in sina_data:
                rows.append({
                    "ts_code": ts_code,
                    "trade_date": item["day"].replace("-", ""),
                    "open": float(item["open"]),
                    "high": float(item["high"]),
                    "low": float(item["low"]),
                    "close": float(item["close"]),
                    "vol": float(item["volume"]),
                })
            # 过滤日期范围
            rows = [r for r in rows if start_date <= r["trade_date"] <= end_date]
            rows.sort(key=lambda x: x["trade_date"])
        else:
            return [], [], source, fallback, ["all_sources_failed"]
    else:
        return [], [], source, fallback, [f"tushare_error:{result.get('msg', result.get('_error', 'unknown'))}"]

    issues = validate(rows, fields, dataset)
    return rows, fields, source, fallback, issues


def fetch_multi(ts_codes, dataset, start_date, end_date):
    """批量调用 (multi_code): 一次请求多个 ts_code, 规避 1次/小时 限频。
    返回 {ts_code: (rows, fields, source, issues)}"""
    ds = DATASETS[dataset]
    codes_str = ",".join(ts_codes)
    params = {"ts_code": codes_str, "start_date": start_date, "end_date": end_date}
    result = tushare_call(ds["api_name"], params, ds["fields"])
    source = result.get("_source", "tushare_rest")
    out = {}
    if "_error" in result or result.get("code") != 0:
        msg = result.get("msg", result.get("_error", "unknown"))
        for tc in ts_codes:
            out[tc] = ([], [], source, [f"tushare_error:{msg}"])
        return out
    data = result.get("data", {})
    fields = data.get("fields", [])
    items = data.get("items", [])
    # 按 ts_code 分组
    grouped = {}
    for it in items:
        row = dict(zip(fields, it))
        tc = row["ts_code"]
        grouped.setdefault(tc, []).append(row)
    for tc in ts_codes:
        rows = sorted(grouped.get(tc, []), key=lambda x: x["trade_date"])
        issues = validate(rows, fields, dataset)
        out[tc] = (rows, fields, source, issues)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=None, help="起始日期 YYYYMMDD, 默认近一年")
    ap.add_argument("--end", default=None, help="结束日期 YYYYMMDD, 默认今日")
    ap.add_argument("--stocks", default=None, help="逗号分隔的ts_code, 默认全部")
    ap.add_argument("--datasets", default="daily,adj_factor,daily_basic", help="逗号分隔的数据集")
    args = ap.parse_args()

    end_date = args.end or datetime.now().strftime("%Y%m%d")
    if args.start:
        start_date = args.start
    else:
        start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")

    stocks_all = load_universe()
    if args.stocks:
        wanted = set(args.stocks.split(","))
        stocks_all = [s for s in stocks_all if s["ts_code"] in wanted]

    datasets = args.datasets.split(",")
    fetch_time = datetime.now().astimezone().isoformat()
    all_codes = [s["ts_code"] for s in stocks_all]

    print("=" * 60)
    print(f"取数任务 · spec v{SPEC_VERSION}")
    print(f"标的: {all_codes}")
    print(f"数据集: {datasets}")
    print(f"日期: {start_date} ~ {end_date}")
    print("=" * 60)

    # 交易日历
    cal = get_trade_cal(start_date, end_date)
    trading_days = [c["cal_date"] for c in cal if c["is_open"] == 1]
    print(f"交易日历: {len(trading_days)} 个交易日")
    if trading_days:
        print(f"  首末日: {trading_days[0]} ~ {trading_days[-1]}")

    summary = []
    for ds_name in datasets:
        if ds_name not in DATASETS:
            print(f"\n[{ds_name}] 未知数据集, 跳过")
            continue
        ds = DATASETS[ds_name]
        print(f"\n=== {ds_name} (限频: {ds['rate_limit']}) ===")

        if ds["multi_code"] and len(all_codes) > 1:
            # 批量调用: 一次请求所有 ts_code
            result_map = fetch_multi(all_codes, ds_name, start_date, end_date)
            for stock in stocks_all:
                tc = stock["ts_code"]
                rows, fields, source, issues = result_map.get(tc, ([], [], "tushare_rest", ["no_data"]))
                status = "PASS" if rows and not issues else "FAIL"
                _write_one(tc, ds_name, start_date, end_date, rows, fields, source, None, issues, fetch_time)
                iss_str = f" issues={issues}" if issues else ""
                print(f"  {tc} {stock.get('name','')} : {status} · {len(rows)}行{iss_str}")
                summary.append((tc, ds_name, status, len(rows), source, None))
        else:
            # 逐只调用 (daily 等)
            for stock in stocks_all:
                tc = stock["ts_code"]
                rows, fields, source, fallback, issues = fetch_one(tc, ds_name, start_date, end_date)
                _write_one(tc, ds_name, start_date, end_date, rows, fields, source, fallback, issues, fetch_time)
                status = "PASS" if rows and not issues else "FAIL"
                fb_str = f" (降级:{fallback})" if fallback else ""
                iss_str = f" issues={issues}" if issues else ""
                print(f"  {tc} {stock.get('name','')} : {status} · {len(rows)}行 · {source}{fb_str}{iss_str}")
                summary.append((tc, ds_name, status, len(rows), source, fallback))
                # daily_basic 逐只调用时, 股票间 sleep 规避 1次/分钟
                if ds["rate_limit"].startswith("1次/分钟") and stock is not stocks_all[-1]:
                    print(f"    (sleep 62s 规避限频...)")
                    time.sleep(62)

    print("\n" + "=" * 60)
    ok = sum(1 for s in summary if s[2] == "PASS")
    print(f"汇总: 成功 {ok} / 失败 {len(summary) - ok} / 共 {len(summary)}")
    print(f"输出目录: {PROCESSED_DIR}")
    print("=" * 60)


def _write_one(ts_code, ds_name, start_date, end_date, rows, fields, source, fallback, issues, fetch_time):
    """写 CSV + metadata"""
    out_csv = f"{PROCESSED_DIR}/{ts_code}_{ds_name}_{start_date}_{end_date}.csv"
    out_meta = f"{META_DIR}/{ts_code}_{ds_name}_{start_date}_{end_date}.json"
    if rows:
        write_csv(rows, fields, out_csv)
    meta = {
        "ts_code": ts_code,
        "dataset": ds_name,
        "source": source,
        "fallback": fallback,
        "fetch_time": fetch_time,
        "params": {"start_date": start_date, "end_date": end_date},
        "row_count": len(rows),
        "date_range": [rows[0]["trade_date"], rows[-1]["trade_date"]] if rows else [],
        "validation": "PASS" if rows and not issues else "FAIL",
        "issues": issues,
        "fields": fields,
        "schema_version": SPEC_VERSION,
        "spec_version": SPEC_VERSION,
    }
    write_meta(meta, out_meta)


if __name__ == "__main__":
    main()
