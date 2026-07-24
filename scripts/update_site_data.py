"""
自动更新站点日线数据
- 读取 strategies/turtle-backtest/data/*.csv 的最新日期
- 从 Tushare REST API 拉取增量数据
- 合并写入 CSV
- 同步更新 strategies/indicator-lab/js/data.js

用于 GitHub Actions 定时任务，也可本地手动运行。
用法:
  python update_site_data.py
"""
import os, csv, json, sys, requests
from datetime import datetime, timedelta

# ========= 配置 =========
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TURTLE_DATA_DIR = os.path.join(ROOT, "strategies", "turtle-backtest", "data")
INDICATOR_DATA_JS = os.path.join(ROOT, "strategies", "indicator-lab", "js", "data.js")

TUSHARE_URL = "https://api.tushare.pro"
TUSHARE_TOKEN = os.environ.get("TUSHARE_TOKEN", "c74d64d9bfd05534d3d55dbe688b4d089d2cbbe7d293de11f9519cb8")

STOCKS = [
    {"code": "300604.SZ", "name": "\u957f\u5ddd\u79d1\u6280"},
    {"code": "688008.SH", "name": "\u6f9c\u8d77\u79d1\u6280"},
    {"code": "000977.SZ", "name": "\u6d6a\u6f6e\u4fe1\u606f"},
]


def tushare_daily(ts_code, start_date, end_date):
    """拉取日线数据"""
    payload = {
        "api_name": "daily",
        "token": TUSHARE_TOKEN,
        "params": {"ts_code": ts_code, "start_date": start_date, "end_date": end_date},
        "fields": "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount",
    }
    try:
        r = requests.post(TUSHARE_URL, json=payload, timeout=60)
        data = r.json()
        if data.get("code") != 0:
            print(f"  Tushare error: {data.get('msg')}")
            return []
        fields = data["data"]["fields"]
        items = data["data"]["items"]
        rows = []
        for it in items:
            row = dict(zip(fields, it))
            for k in ["open", "high", "low", "close", "pre_close", "change", "pct_chg", "vol", "amount"]:
                if k in row:
                    row[k] = float(row[k])
            rows.append(row)
        rows.sort(key=lambda x: x["trade_date"])
        return rows
    except Exception as e:
        print(f"  Request failed: {e}")
        return []


def read_csv(path):
    """读现有 CSV，返回 (rows, headers)"""
    if not os.path.exists(path):
        return [], []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        rows = list(reader)
    # 转换数值字段
    for row in rows:
        for k in ["open", "high", "low", "close", "pre_close", "change", "pct_chg", "vol", "amount"]:
            if k in row and row[k]:
                try:
                    row[k] = float(row[k])
                except ValueError:
                    pass
    rows.sort(key=lambda x: x["trade_date"])
    return rows, headers


def write_csv(path, rows, headers):
    """写 CSV"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def update_stock(stock):
    """更新单只股票的数据"""
    code = stock["code"]
    csv_path = os.path.join(TURTLE_DATA_DIR, f"{code}_daily.csv")
    existing_rows, headers = read_csv(csv_path)

    today = datetime.now().strftime("%Y%m%d")
    last_date = None
    if existing_rows:
        last_date = existing_rows[-1]["trade_date"]
        print(f"  {code} {stock['name']}: 现有 {len(existing_rows)} 行, 最新 {last_date}")
    else:
        print(f"  {code} {stock['name']}: 无现有数据")

    # 判断是否需要更新
    if last_date and last_date >= today:
        print(f"    已是最新，跳过")
        return existing_rows, [], False

    # 确定拉取范围
    if last_date:
        # 增量：从 last_date 后一天开始
        start_dt = datetime.strptime(last_date, "%Y%m%d") + timedelta(days=1)
        start_date = start_dt.strftime("%Y%m%d")
    else:
        # 全量：近一年
        start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")

    end_date = today
    print(f"    拉取 {start_date} ~ {end_date}...")

    new_rows = tushare_daily(code, start_date, end_date)

    if not new_rows:
        print(f"    无新数据（可能是非交易日）")
        return existing_rows, [], False

    # 合并去重
    date_set = {r["trade_date"] for r in existing_rows}
    added = 0
    for r in new_rows:
        if r["trade_date"] not in date_set:
            existing_rows.append(r)
            date_set.add(r["trade_date"])
            added += 1

    existing_rows.sort(key=lambda x: x["trade_date"])
    print(f"    新增 {added} 行, 共计 {len(existing_rows)} 行, 最新 {existing_rows[-1]['trade_date']}")

    return existing_rows, new_rows[:added] if added > 0 else [], added > 0


def build_data_js(all_data):
    """根据所有股票数据生成 indicator-lab 用的 data.js"""
    lines = [
        "// 自动生成 - 请勿手动编辑",
        "// 由 update_site_data.py 从 Tushare 生成",
        "// 确保工具在 file:// 协议下双击即用",
        "",
        "window.STOCK_DATA = ",
        json.dumps(all_data, ensure_ascii=False, indent=None),
        ";",
        "",
        "// notebook产出的指标参考值(仅长川科技), 用于D1-D4数值比对验证",
        "// 注意: 此段仅用于验证, 实际指标由浏览器实时计算",
        "window.NOTEBOOK_INDICATORS = [];",
        "",
    ]
    return "\n".join(lines)


def format_row_for_json(row, code):
    """将一个 CSV row 格式化为 data.js 用的紧凑对象"""
    return {
        "ts_code": code,
        "trade_date": row["trade_date"],
        "open": float(row["open"]),
        "high": float(row["high"]),
        "low": float(row["low"]),
        "close": float(row["close"]),
        "pre_close": float(row["pre_close"]),
        "change": float(row["change"]),
        "pct_chg": float(row["pct_chg"]),
        "vol": float(row["vol"]),
        "amount": float(row["amount"]),
    }


def update_data_js(stock_data_map):
    """更新 indicator-lab 的嵌入式数据文件"""
    all_data = {}
    for code in stock_data_map:
        rows = stock_data_map[code]
        stock_info = next((s for s in STOCKS if s["code"] == code), {"name": code})
        all_data[code] = {
            "code": code,
            "name": stock_info["name"],
            "rows": [format_row_for_json(r, code) for r in rows],
        }

    js_content = build_data_js(all_data)
    with open(INDICATOR_DATA_JS, "w", encoding="utf-8") as f:
        f.write(js_content)
    print(f"  已更新 {INDICATOR_DATA_JS} ({len(all_data)} 只股票)")


def main():
    print("=" * 60)
    print(f"AI Quant Lab 数据更新 · {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    any_updated = False
    stock_data_map = {}

    for stock in STOCKS:
        rows, new_rows, updated = update_stock(stock)

        if updated and rows:
            headers = ["ts_code", "trade_date", "open", "high", "low", "close",
                       "pre_close", "change", "pct_chg", "vol", "amount"]
            csv_path = os.path.join(TURTLE_DATA_DIR, f"{stock['code']}_daily.csv")
            write_csv(csv_path, rows, headers)
            any_updated = True

        if rows:
            stock_data_map[stock["code"]] = rows

    # 始终更新 data.js（即使数据没变，保证文件存在）
    if stock_data_map:
        update_data_js(stock_data_map)

    print("=" * 60)
    if any_updated:
        print("✅ 数据已更新，需要重新部署")
        sys.exit(0)
    else:
        print("⏭️  数据已是最新，无需更新")
        sys.exit(0)  # 数据已最新，正常退出


if __name__ == "__main__":
    main()
