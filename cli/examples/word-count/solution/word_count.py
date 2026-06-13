import json
import os
import sys
import time
from collections import Counter

text = sys.stdin.read()
manifest = json.loads(os.environ["TRAP_MANIFEST"])
inputs = manifest["inputs"]
outputs = manifest["outputs"]

with open(inputs["config.json"]) as f:
    config = json.load(f)

top_n: int = config.get("top_n", 10)
case_sensitive: bool = config.get("case_sensitive", False)

words = text.split()
if not case_sensitive:
    words = [w.lower() for w in words]

counts = Counter(words)

time.sleep(1)

with open(outputs["frequencies.json"], "w") as f:
    json.dump(dict(counts), f)

top_words = [{"word": w, "count": c} for w, c in counts.most_common(top_n)]
with open(outputs["summary.json"], "w") as f:
    json.dump({"total_words": len(words), "unique_words": len(counts), "top_words": top_words}, f)
