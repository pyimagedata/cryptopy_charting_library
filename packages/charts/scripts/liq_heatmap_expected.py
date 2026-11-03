"""Parity helper: reads fixtures/liq-raw.json, computes the expected liq-heatmap payloads with the
server model (backend/indicators/liqheatmap.py) and writes fixtures/liq-expected.json.
Usage: <backend venv python> liq_heatmap_expected.py <liqheatmap.py path> <fixture dir>"""
import importlib.util, json, sys
import numpy as np

mod_path, fx_dir = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("liqheatmap", mod_path)
lh = importlib.util.module_from_spec(spec); spec.loader.exec_module(lh)

raw = json.load(open(f"{fx_dir}/liq-raw.json"))
kt = np.array(raw["kt"], np.int64); kh = np.array(raw["kh"], float); kl = np.array(raw["kl"], float); kc = np.array(raw["kc"], float)
ks = np.array(raw["ks"], float)  # taker buy share per bar (kline[9]/kline[5], 0.5 if volume 0)
ot = np.array(raw["ot"], np.int64); ov = np.array(raw["ov"], float)
END = raw["end"]
BAR_MS, OI_HEAD_MS = lh.BAR_MS, 3600 * 1000


def load_inputs_remote(start_ms, end_ms, live):  # liqremote.load_inputs_remote with the raw arrays
    km = (kt >= start_ms - BAR_MS) & (kt < end_ms)
    if not live:
        km &= (kt + BAR_MS <= end_ms)
    om = (ot >= start_ms - BAR_MS - OI_HEAD_MS) & (ot < end_ms)
    return lh.align_inputs(kt[km], kh[km], kl[km], kc[km], ot[om], ov[om], ks[km])


def build(code, period, end_ms, live, start_ms, split):  # build_heatmap payload assembly
    secs, bucket_sec = lh.PERIODS[period]
    bucket_ms = bucket_sec * 1000
    t, h, l, c, oi, oi_last, bs = load_inputs_remote(start_ms, end_ms, live)
    binsz = lh.nice_bin_size(float(np.median(c)))
    res = lh.liq_model(t, h, l, c, oi, bucket_ms, binsz, buy_share=bs if split == "taker" else None)
    L, S, starts, lo, nb = res["L"], res["S"], res["bucket_starts"], res["lo"], res["nb"]
    scale = float(max(L.max(), S.max()))
    bins = []
    for side, M in (("long", L), ("short", S)):
        for b, runs in sorted(lh.encode_runs(M, starts, bucket_ms, start_ms, end_ms, scale).items()):
            bins.append({"p": round(lo + b * binsz, 8), "side": side, "runs": runs})
    bins.sort(key=lambda x: (x["p"], x["side"]))
    ps = [x["p"] for x in bins]
    return {"symbol": code, "period": period, "bucket_sec": bucket_sec, "start": start_ms, "end": end_ms,
            "bin_size": binsz, "scale": scale, "price_min": min(ps) if ps else lo,
            "price_max": (max(ps) + binsz) if ps else lo + nb * binsz, "bins": bins, "oi_last_time": oi_last}


out = {"end": END, "payloads": {"taker": {}, "equal": {}}}
for split in ("taker", "equal"):
    for period in ("12h", "24h", "3d", "1w"):
        start = END - lh.PERIODS[period][0] * 1000
        out["payloads"][split][period] = build("BTCUSDT", period, END, False, start, split)
# extra: nice_bin_size probes
out["nice"] = [[p, lh.nice_bin_size(p)] for p in (0.00001234, 0.0456, 0.37, 1.9, 23.4, 87.5, 640.0, 2500.0, 66000.0, 97123.4)]
json.dump(out, open(f"{fx_dir}/liq-expected.json", "w"))
print("expected written:", {sp: {k: len(v["bins"]) for k, v in d.items()} for sp, d in out["payloads"].items()})
