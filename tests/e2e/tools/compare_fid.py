import json, sys

before = {d["name"]: d for d in json.load(open(sys.argv[1], encoding="utf-8"))}
after = {d["name"]: d for d in json.load(open(sys.argv[2], encoding="utf-8"))}


def good(doc: dict) -> str:
    """Pages whose text matches the reference (>= 0.9) out of the reference's pages."""
    return f"{sum(1 for p in doc['pages'] if p['text'] >= 0.9)}/{len(doc['pages'])}"


print(f"{'document':46} {'pages ref/got':^22} {'text>=0.9 pages':^18}")
for name, a in after.items():
    b = before[name]
    pages = f"{b['reference_pages']}/{b['imported_pages']} -> {a['reference_pages']}/{a['imported_pages']}"
    print(f"{name[:46]:46} {pages:^22} {good(b) + ' -> ' + good(a):^18}")
