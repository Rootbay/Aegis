import pathlib
import re
import subprocess
from collections import defaultdict
print("starting mismatch analysis script")
root = pathlib.Path('.')
command_files = list((root / 'src-tauri' / 'src').rglob('*.rs'))
command_pattern = re.compile(r"#\[tauri::command\]\s*pub(?:\s*\([^)]*\))?\s+(?:async\s+)?fn\s+([A-Za-z0-9_]+)(?:<[^>]*>)?\s*\((.*?)\)", re.S)
QUOTE_CHARS = '"\'' + chr(96)


def split_params(param_str):
    parts = []
    depth = 0
    current = []
    for ch in param_str:
        if ch == '<':
            depth += 1
            current.append(ch)
        elif ch == '>':
            depth = max(depth - 1, 0)
            current.append(ch)
        elif ch == ',' and depth == 0:
            part = ''.join(current).strip()
            if part:
                parts.append(part)
            current = []
        else:
            current.append(ch)
    part = ''.join(current).strip()
    if part:
        parts.append(part)
    return parts

special_words = ["AppHandle", "State", "Window"]
backend_commands = {}
for file in command_files:
    text = file.read_text(encoding='utf-8')
    for match in command_pattern.finditer(text):
        name = match.group(1)
        params = match.group(2)
        param_names = []
        for param in split_params(params):
            parts = param.split(':', 1)
            if len(parts) != 2:
                continue
            pname = parts[0].strip()
            ptype = parts[1].strip()
            if not pname:
                continue
            skip = False
            for word in special_words:
                if re.search(rf'\b{word}\b', ptype):
                    skip = True
                    break
            if not skip:
                param_names.append(pname)
        backend_commands[name] = set(param_names)

grep_result = subprocess.run(
    ["bash", "-lc", "grep -R -l 'invoke(' src/lib"],
    capture_output=True,
    text=True,
    check=True,
)
front_files = []
for line in grep_result.stdout.splitlines():
    path_text = line.strip()
    if not path_text:
        continue
    front_files.append(root / path_text)
print(f"Scanning {len(front_files)} front files (matching invoke calls)")
invoke_pattern = re.compile(r'invoke\s*\(\s*["\']([A-Za-z0-9_]+)["\']\s*,', re.S)


def skip_string(text, i):
    quote = text[i]
    i += 1
    length = len(text)
    while i < length:
        ch = text[i]
        if ch == '\\':
            i += 2
            continue
        if ch == quote:
            return i + 1
        i += 1
    return i


def parse_object_literal(text, start):
    i = start
    length = len(text)
    while i < length and text[i].isspace():
        i += 1
    if i >= length or text[i] != '{':
        return None
    depth = 0
    j = i
    while j < length:
        ch = text[j]
        if ch == '{':
            depth += 1
            j += 1
            continue
        if ch == '}':
            depth -= 1
            j += 1
            if depth == 0:
                return text[i:j], j
            continue
        if ch in QUOTE_CHARS:
            j = skip_string(text, j)
            continue
        if ch == '/' and j + 1 < length:
            nxt = text[j + 1]
            if nxt == '/':
                j += 2
                while j < length and text[j] != '\n':
                    j += 1
                continue
            if nxt == '*':
                j += 2
                while j + 1 < length and not (text[j] == '*' and text[j + 1] == '/'):
                    j += 1
                j += 2
                continue
        j += 1
    return None


def extract_keys(obj_literal):
    keys = []
    depth = 0
    i = 0
    length = len(obj_literal)
    while i < length:
        ch = obj_literal[i]
        if ch in QUOTE_CHARS:
            i = skip_string(obj_literal, i)
            continue
        if ch == '{':
            depth += 1
            i += 1
            continue
        if ch == '}':
            depth -= 1
            i += 1
            continue
        if depth == 1:
            if ch.isspace() or ch == ',':
                i += 1
                continue
            key = None
            if ch in QUOTE_CHARS:
                quote = ch
                i += 1
                start = i
                while i < length:
                    if obj_literal[i] == '\\':
                        i += 2
                        continue
                    if obj_literal[i] == quote:
                        key = obj_literal[start:i]
                        i += 1
                        break
                    i += 1
            else:
                start = i
                while i < length and (obj_literal[i].isalnum() or obj_literal[i] in '_$'):
                    i += 1
                key = obj_literal[start:i]
            if not key:
                continue
            while i < length and obj_literal[i].isspace():
                i += 1
            if i < length and obj_literal[i] == ':':
                keys.append(key)
                i += 1
                continue
        i += 1
    return keys

mismatches = defaultdict(list)
command_missing = defaultdict(list)
for idx, file in enumerate(front_files, 1):
    if ".test." in file.name or ".spec." in file.name:
        continue
    print(f"processing file {idx}/{len(front_files)}: {file}")
    text = file.read_text(encoding='utf-8')
    for match in invoke_pattern.finditer(text):
        command = match.group(1)
        obj = parse_object_literal(text, match.end())
        if not obj:
            continue
        literal, _ = obj
        keys = extract_keys(literal)
        if not keys:
            continue
        expected = backend_commands.get(command)
        lineno = text.count('\n', 0, match.start()) + 1
        if expected is None:
            command_missing[command].append((str(file), lineno))
            continue
        unknown = [key for key in keys if key not in expected]
        if unknown:
            mismatches[(str(file), lineno, command)].extend(unknown)

print('Found', len(backend_commands), 'backend commands +', len(mismatches), 'mismatches,', len(command_missing), 'unknown commands')
for (fpath, lineno, command), keys in mismatches.items():
    print(f"MISMATCH: {command} @ {fpath}:{lineno} -> {keys}")
for command, entries in command_missing.items():
    for fpath, lineno in entries:
        print(f"UNKNOWN CMD: {command} invoked in {fpath}:{lineno}")
