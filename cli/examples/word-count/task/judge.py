import json
import os
from pathlib import Path

if __name__ == "__main__":
    data = json.loads(os.environ["TRAPTASK_MANIFEST"])

    actual_freq = json.loads(Path(data["outputs"]["frequencies.json"]).read_text())
    actual_summary = json.loads(Path(data["outputs"]["summary.json"]).read_text())
    expected_freq = json.loads(Path(data["expected"]["frequencies.json"]).read_text())
    expected_summary = json.loads(Path(data["expected"]["summary.json"]).read_text())

    freq_ok = actual_freq == expected_freq
    summary_ok = actual_summary == expected_summary
    score = (int(freq_ok) + int(summary_ok)) / 2

    print(json.dumps({"frequencies_correct": freq_ok, "summary_correct": summary_ok, "score": score}))
