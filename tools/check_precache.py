from __future__ import annotations

import os
import re
import sys
from fnmatch import fnmatch
from pathlib import Path


DEFAULT_ROOT = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get("KMG_PRECACHE_ROOT", str(DEFAULT_ROOT))).resolve()
WEB_ROOT = Path(os.environ.get("KMG_PRECACHE_WEB_ROOT", str(ROOT / "web"))).resolve()
SERVICE_WORKER = Path(os.environ.get("KMG_PRECACHE_SERVICE_WORKER", str(WEB_ROOT / "sw.js"))).resolve()
IGNORE_FILE = Path(
    os.environ.get("KMG_PRECACHE_IGNORE_FILE", str(ROOT / "tools" / "check_precache.ignore"))
).resolve()
VIRTUAL_ENTRIES = {"./"}
DEFAULT_IGNORED_PATTERNS = {
    "sw.js",
    "asset-manifest.json",
    "precache-manifest.*",
}
PRECACHEABLE_SUFFIXES = {
    ".css",
    ".gif",
    ".html",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".png",
    ".svg",
    ".webmanifest",
    ".webp",
}


def load_ignored_patterns() -> set[str]:
    patterns = set(DEFAULT_IGNORED_PATTERNS)
    if not IGNORE_FILE.exists():
        return patterns

    for raw_line in IGNORE_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if line:
            patterns.add(line)
    return patterns


def extract_precache_body(source: str) -> str:
    declaration = re.search(r"\bPRECACHE\b", source)
    if not declaration:
        raise RuntimeError("Could not find PRECACHE declaration in web/sw.js")

    start = source.find("[", declaration.end())
    if start == -1:
        raise RuntimeError("Could not find PRECACHE array in web/sw.js")

    depth = 0
    in_string: str | None = None
    escape = False
    in_line_comment = False
    body: list[str] = []

    for index in range(start, len(source)):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""

        if in_line_comment:
            if char == "\n":
                in_line_comment = False
                if depth:
                    body.append(char)
            continue

        if in_string:
            if depth > 1:
                body.append(char)
            elif depth == 1 and char not in "[]":
                body.append(char)

            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == in_string:
                in_string = None
            continue

        if char == "/" and next_char == "/" and depth:
            in_line_comment = True
            continue

        if char in {'"', "'"}:
            in_string = char
            if depth:
                body.append(char)
            continue

        if char == "[":
            depth += 1
            if depth > 1:
                body.append(char)
            continue

        if char == "]":
            depth -= 1
            if depth == 0:
                return "".join(body)
            body.append(char)
            continue

        if depth:
            body.append(char)

    raise RuntimeError("PRECACHE array is not balanced in web/sw.js")


def parse_precache_entries() -> set[str]:
    source = SERVICE_WORKER.read_text(encoding="utf-8")
    body = extract_precache_body(source)
    entries = set()
    for raw_line in body.splitlines():
        line = raw_line.strip().rstrip(",")
        if not line:
            continue

        entry = re.fullmatch(r"(['\"])(.+?)\1", line)
        if entry:
            entries.add(entry.group(2))
    return entries


def find_web_files() -> set[str]:
    ignored_patterns = load_ignored_patterns()
    files = set()
    for path in WEB_ROOT.rglob("*"):
        if not path.is_file():
            continue

        relative = path.relative_to(WEB_ROOT).as_posix()
        if any(fnmatch(relative, pattern) for pattern in ignored_patterns):
            continue
        if path.suffix.lower() not in PRECACHEABLE_SUFFIXES:
            continue

        files.add(f"./{relative}")

    return files


def main() -> int:
    precache_entries = parse_precache_entries()
    expected_entries = find_web_files()

    missing = sorted(expected_entries - precache_entries)
    stale = sorted(precache_entries - expected_entries - VIRTUAL_ENTRIES)

    if missing:
        print("Missing from PRECACHE:")
        for entry in missing:
            print(f"  - {entry}")

    if stale:
        print("Listed in PRECACHE but missing on disk:")
        for entry in stale:
            print(f"  - {entry}")

    if missing or stale:
        return 1

    print(f"PRECACHE is complete ({len(expected_entries)} files checked).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
