# /// script
# requires-python = ">=3.11"
# dependencies = ["mistralai>=1.0"]
# ///
import json
import os
from pathlib import Path

from mistralai.client import Mistral

inputs = json.loads(os.environ["TRAP_MANIFEST"])["inputs"]
question = Path(inputs["question.txt"]).read_text().strip()

# Explicitly pass server_url so the trap cost proxy (injected via MISTRAL_BASE_URL) is honoured.
client = Mistral(
    api_key=os.environ.get("MISTRAL_API_KEY"),
    server_url=os.environ.get("MISTRAL_BASE_URL"),
)
response = client.chat.complete(
    model="mistral-small-latest",
    max_tokens=256,
    messages=[{"role": "user", "content": question}],
)
print(response.choices[0].message.content)
