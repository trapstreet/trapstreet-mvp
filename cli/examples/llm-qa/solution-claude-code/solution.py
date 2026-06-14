# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
import json
import os
import subprocess
from pathlib import Path

inputs_dir = Path(json.loads(os.environ["TRAP_MANIFEST"])["inputs_dir"])
question = (inputs_dir / "question.txt").read_text().strip()

result = subprocess.run(["claude", "-p", question], capture_output=True, text=True, check=True)
print(result.stdout)
