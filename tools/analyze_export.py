#!/usr/bin/env python3
"""
Row/column analysis of a Shaadi Bells sheet export (read-only).

Usage:
    python3 tools/analyze_export.py path/to/export.csv
    python3 tools/analyze_export.py path/to/export.txt   # "## Sheet name: Sheet1" text export

Export from Google Sheets with File ▸ Download ▸ Comma-separated values (current sheet).
Prints: fill rate per column, section labels, duplicate IDs, birth-year spread,
height formats, pronoun/label mismatches, stated ages, placeholder hashtags,
ad/caption format conformance. Exports contain personal profile data — keep them
out of git (see .gitignore).
"""
import collections
import csv
import io
import re
import sys

CORE = ["#shaadibells", "#matrimonialsolutions", "#jeevansathi", "#shaadi"]
HEADS = ["💖 Seeking", "✨ Introduction", "✨ Key Highlights",
         "💌 About Shaadi Bells Matrimonial Solutions", "📞 Contact Shaadi Bells Matrimonial Solutions"]


def load(path):
    text = open(path, encoding="utf-8").read()
    if text.startswith("## Sheet name:"):
        parts = re.split(r"^## Sheet name: (.*)$", text, flags=re.M)
        sheets = {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}
        text = sheets.get("Sheet1", parts[2]).strip("\n")
    rows = list(csv.reader(io.StringIO(text)))
    width = max(len(r) for r in rows)
    return [r + [""] * (width - len(r)) for r in rows]


def main(path):
    rows = load(path)
    header, body = rows[0], rows[1:]
    nonempty = [r for r in body if any(c.strip() for c in r)]
    print(f"Rows with data: {len(nonempty)}  ·  columns: {len(header)}\n")

    print("Fill rate per column")
    for i, h in enumerate(header):
        filled = sum(1 for r in nonempty if r[i].strip())
        print(f"  {chr(65 + i)}  {h.strip()[:32]:32} {filled:5}  ({filled * 100 // max(1, len(nonempty))}%)")

    profiles, labels, section = [], [], ""
    for n, r in enumerate(body, 2):
        a = r[0].strip()
        m = re.search(r"SM\d+", a, re.I)
        if m:
            profiles.append((n, m.group().upper(), section, r))
        elif a and not a.lower().startswith("registration"):
            section = a
            labels.append((n, a))
    print(f"\nProfile rows: {len(profiles)}  ·  section labels: {labels}")

    ids = collections.Counter(p[1] for p in profiles)
    dups = {k: v for k, v in ids.items() if v > 1}
    print(f"Duplicate IDs ({len(dups)}): {dups}")
    nums = sorted(int(k[2:]) for k in ids)
    if nums:
        gaps = [x for x in range(nums[0], nums[-1] + 1) if x not in set(nums)]
        print(f"ID range SM{nums[0]}–SM{nums[-1]}  ·  gaps: {gaps}")

    years = collections.Counter(p[3][1].strip() for p in profiles)
    print(f"Birth years: {sorted(years.items())}")
    heights = collections.Counter(re.sub(r"\d", "9", p[3][3].strip()) for p in profiles)
    print(f"Height formats: {dict(heights)}")

    issues = collections.defaultdict(list)
    for n, pid, sec, r in profiles:
        ad, cap = r[13], r[14] if len(r) > 14 else ""
        gender = "F" if re.search(r"\bgirl", r[0] + " " + sec, re.I) and not re.search(r"\bboy", r[0], re.I) else "M"
        text = cap.split("✨ Key Highlights")[0] + " " + ad
        male = len(re.findall(r"\b(he|him|his|son|groom)\b", text, re.I))
        fem = len(re.findall(r"\b(she|her|daughter|bride)\b", text, re.I))
        if (gender == "M" and fem >= 3 and fem > male) or (gender == "F" and male >= 3 and male > fem):
            issues["pronouns contradict label"].append(pid)
        if re.search(r"\bage[:\s]*\d{2}\b|\d{2}[- ]years?[- ]old", text, re.I):
            issues["stated age"].append(pid)
        if re.search(r"customhashtag", cap, re.I):
            issues["placeholder hashtag"].append(pid)
        if cap.count("💖 Seeking") > 1:
            issues["duplicate Seeking"].append(pid)
        if not ad.strip():
            issues["ad empty"].append(pid)
        elif len(ad.split("\n")) != 13:
            issues["ad not 13 points"].append(pid)
        if cap.strip():
            tags = re.findall(r"#[A-Za-z0-9_]+", cap)
            if len(tags) != 18 or tags[:4] != CORE:
                issues["hashtags not 4 brand + 14"].append(pid)
            if any(h not in cap for h in HEADS):
                issues["caption section missing"].append(pid)
        else:
            issues["caption empty"].append(pid)
    print("\nFindings")
    for k, v in sorted(issues.items(), key=lambda kv: -len(kv[1])):
        print(f"  {k:30} {len(v):4}  {', '.join(v[:10])}{' …' if len(v) > 10 else ''}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
