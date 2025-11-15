#!/usr/bin/env python3
"""Verify that Tauri invoke payload keys align with backend command parameters."""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys
from collections import defaultdict
from typing import Iterable, List, Set, Tuple


ROOT = pathlib.Path(__file__).resolve().parents[1]
BACKEND_SRC = ROOT / "src-tauri" / "src"
FRONT_SRC = ROOT / "src"


def collect_backend_commands() -> dict[str, Set[str]]:
    """Return a mapping from command name to the set of accepted payload keys."""
    command_pattern = re.compile(
        r"#\s*\[\s*tauri::command\]\s*pub(?:\s*\([^)]*\))?\s+(?:async\s+)?fn\s+([A-Za-z0-9_]+)(?:<[^>]*>)?\s*\((.*?)\)",
        re.S,
    )
    skip_tokens = {"AppHandle", "State", "Window"}
    commands: dict[str, Set[str]] = {}
    struct_commands: Set[str] = set()

    for rs_path in BACKEND_SRC.rglob("*.rs"):
        text = rs_path.read_text(encoding="utf-8")
        for match in command_pattern.finditer(text):
            name = match.group(1)
            params = match.group(2)
            parsed = parse_parameters(params, skip_tokens)
            commands[name] = {param_name for param_name, _ in parsed}
            if any(
                type_part
                and (
                    "Payload" in type_part
                    or "Request" in type_part
                    or (
                        "Command" in type_part
                        and not type_part.endswith("CommandResult")
                    )
                )
                for _, type_part in parsed
            ):
                struct_commands.add(name)
    return commands, struct_commands


def parse_parameters(param_str: str, skip_tokens: Set[str]) -> List[Tuple[str, str]]:
    """Split a Rust parameter list into names and drop ignored types."""
    params: List[str] = []
    depth = 0
    current = []
    for char in param_str:
        if char == "<":
            depth += 1
        elif char == ">":
            depth = max(depth - 1, 0)
        if char == "," and depth == 0:
            params.append("".join(current).strip())
            current.clear()
            continue
        current.append(char)
    last = "".join(current).strip()
    if last:
        params.append(last)

    names: List[Tuple[str, str]] = []
    for entry in params:
        entry = entry.replace("mut ", "").strip()
        if not entry:
            continue
        parts = entry.split(":", 1)
        if len(parts) != 2:
            continue
        name = parts[0].strip()
        type_part = parts[1]
        if any(token in type_part for token in skip_tokens):
            continue
        names.append((name, type_part))
    return names


def find_invoke_candidate_files() -> list[pathlib.Path]:
    includes = [
        "*.ts",
        "*.tsx",
        "*.js",
        "*.jsx",
        "*.svelte",
        "*.mjs",
    ]
    include_flags = " ".join(f"--include='{pattern}'" for pattern in includes)
    cmd = f"grep -R -l {include_flags} \"invoke(\" src"
    try:
        result = subprocess.run(
            ["bash", "-lc", cmd],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        paths = [ROOT / line.strip() for line in result.stdout.splitlines() if line.strip()]
        unique = list(dict.fromkeys(paths))
        if unique:
            return unique
    except FileNotFoundError:
        pass

    fallback: list[pathlib.Path] = []
    for path in FRONT_SRC.rglob("*"):
        if path.suffix.lower() not in {".ts", ".js", ".tsx", ".jsx", ".svelte", ".mjs"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if "invoke(" in text:
            fallback.append(path)
    return fallback


def collect_frontend_invokes(
    struct_commands: Set[str],
) -> list[Tuple[pathlib.Path, str, int, list[str]]]:
    """Return list of (path, command, line, keys) tuples for each invoke call."""
    invoke_pattern = re.compile(r"invoke\(\s*['\"]([A-Za-z0-9_]+)['\"]\s*,", re.S)
    script_tag_pattern = re.compile(r"<script[^>]*>(.*?)</script>", re.S)
    result: list[Tuple[pathlib.Path, str, int, list[str]]] = []

    candidate_files = find_invoke_candidate_files()
    print(f"scanning {len(candidate_files)} files for invoke calls...")

    for idx, path in enumerate(candidate_files, start=1):
        print(f"  [{idx}/{len(candidate_files)}] reading {path}")
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        script_blocks: list[tuple[str, int]] = []
        if path.suffix.lower() == ".svelte":
            for script_match in script_tag_pattern.finditer(text):
                block_text = script_match.group(1)
                block_start = script_match.start(1)
                script_blocks.append((block_text, block_start))
        else:
            script_blocks.append((text, 0))

        for block, base_index in script_blocks:
            if "invoke(" not in block:
                continue
            print(f"    scanning invoke payloads in {path}")
            for match in invoke_pattern.finditer(block):
                command = match.group(1)
                if command in struct_commands:
                    continue
                obj = extract_object_literal(block, match.end())
                if not obj:
                    continue
                keys = extract_keys(obj)
                if not keys:
                    continue
                location = base_index + match.start()
                line_no = text.count("\n", 0, location) + 1
                result.append((path.relative_to(ROOT), command, line_no, keys))
    print(f"discovered {len(result)} invoke payloads")
    return result


def extract_object_literal(text: str, start: int) -> str | None:
    """Return the object literal starting after 'invoke(...,' or None."""
    i = start
    length = len(text)
    while i < length and text[i].isspace():
        i += 1
    if i >= length or text[i] != "{":
        return None
    depth = 0
    j = i
    while j < length:
        ch = text[j]
        if ch == "{":
            depth += 1
            j += 1
            continue
        if ch == "}":
            depth -= 1
            j += 1
            if depth == 0:
                return text[i:j]
            continue
        if ch in "\"'`":
            j = skip_string(text, j)
            continue
        if ch == "/" and j + 1 < length:
            nxt = text[j + 1]
            if nxt == "/":
                j += 2
                while j < length and text[j] != "\n":
                    j += 1
                continue
            if nxt == "*":
                j += 2
                while j + 1 < length and not (text[j] == "*" and text[j + 1] == "/"):
                    j += 1
                j += 2
                continue
        j += 1
    return None


def skip_string(text: str, idx: int) -> int:
    quote = text[idx]
    idx += 1
    length = len(text)
    while idx < length:
        ch = text[idx]
        if ch == "\\":
            idx += 2
            continue
        if ch == quote:
            return idx + 1
        idx += 1
    return idx


def extract_keys(obj_literal: str) -> list[str]:
    keys: list[str] = []
    depth = 0
    i = 0
    length = len(obj_literal)
    while i < length:
        ch = obj_literal[i]
        if ch in "\"'`":
            i = skip_string(obj_literal, i)
            continue
        if ch == "{":
            depth += 1
            i += 1
            continue
        if ch == "}":
            depth -= 1
            i += 1
            continue
        if depth == 1:
            if ch.isspace() or ch == ",":
                i += 1
                continue
            key = None
            if ch in "\"'`":
                quote = ch
                i += 1
                start = i
                while i < length:
                    if obj_literal[i] == "\\":
                        i += 2
                        continue
                    if obj_literal[i] == quote:
                        key = obj_literal[start:i]
                        i += 1
                        break
                    i += 1
            else:
                start = i
                while i < length and (obj_literal[i].isalnum() or obj_literal[i] in "_$"):
                    i += 1
                key = obj_literal[start:i]
            if not key:
                i += 1
                continue
            while i < length and obj_literal[i].isspace():
                i += 1
            if i < length and obj_literal[i] == ":":
                keys.append(key)
                i += 1
                continue
        i += 1
    return keys


def main() -> None:
    backend_commands, struct_commands = collect_backend_commands()
    print(f"found {len(backend_commands)} backend commands")
    invokes = collect_frontend_invokes(struct_commands)

    mismatches: list[Tuple[pathlib.Path, int, str, list[str]]] = []
    unknown_commands: list[str] = []

    for path, command, line, keys in invokes:
        expected = backend_commands.get(command)
        if expected is None:
            unknown_commands.append(f"{command} ({path}:{line})")
            continue
        extras = [key for key in keys if key not in expected]
        if extras:
            mismatches.append((path, line, command, extras))

    if mismatches:
        print("Found payload key mismatches:")
        for path, line, command, extras in mismatches:
            print(f"  {command} @ {path}:{line} -> unexpected keys {extras}")

    if unknown_commands:
        print("\nInvokes referencing unregistered commands:")
        for entry in unknown_commands:
            print(f"  {entry}")

    if mismatches or unknown_commands:
        print("\nFix the above payloads before continuing.")
        raise SystemExit(1)

    print("All invoke payloads match backend commands.")


if __name__ == "__main__":
    main()
