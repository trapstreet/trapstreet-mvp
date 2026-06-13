# /// script
# requires-python = ">=3.11"
# dependencies = ["openai>=1.0"]
# ///
import json
import os
from pathlib import Path

from openai import OpenAI

inputs = json.loads(os.environ["TRAP_MANIFEST"])["inputs"]
question = Path(inputs["question.txt"]).read_text().strip()

client = OpenAI()

answer_mini = (
    client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=256,
        messages=[{"role": "user", "content": question}],
    )
    .choices[0]
    .message.content.strip()
)

answer_4o = (
    client.chat.completions.create(
        model="gpt-4o",
        max_tokens=256,
        messages=[{"role": "user", "content": question}],
    )
    .choices[0]
    .message.content.strip()
)

print(f"{answer_mini}\n\n---\n\n{answer_4o}")
