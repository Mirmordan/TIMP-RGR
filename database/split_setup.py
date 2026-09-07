#!/usr/bin/env python3
"""Разрез pg_dump --schema-only на секции: core / functions / security /
policies / grants. Строки комментариев перед утверждением переносятся вместе
с ним. Заголовки SET/pg_dump сохраняются в core.sql.

Использование: split_setup.py <schema.sql> <outdir>
"""
import os
import re
import sys

SECURITY_FNS = {
    "has_capability", "has_permission", "is_admin", "is_owner",
    "object_can", "object_permission_candidates", "session_user_id",
    "user_has_permission", "user_is_admin", "user_is_owner",
}
FN_RE = re.compile(r"^CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)")


def classify(stmt: str, comments: str):
    body = re.sub(r"^(\s*--[^\n]*\n)+", "", stmt) if stmt.lstrip().startswith("--") else stmt
    first = body.lstrip()
    if first.startswith("GRANT") or first.startswith("REVOKE"):
        return "grants"
    if first.startswith("CREATE POLICY"):
        return "policies"
    if re.match(r"^ALTER TABLE .* (ENABLE|FORCE) ROW LEVEL SECURITY", first):
        return "policies"
    m = FN_RE.match(first)
    if m:
        return "security" if m.group(1) in SECURITY_FNS else "functions"
    return "core"


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    buckets = {"core": [], "functions": [], "security": [], "policies": [], "grants": []}
    header_buf: list[str] = []  # накопленные комментарии перед stmt
    stmt: list[str] = []
    dollar = 0
    with open(src, encoding="utf-8") as f:
        for line in f:
            stmt.append(line)
            # считаем переключения $$ вне строковых литералов (в дампе их нет)
            dollar ^= line.count("$$")
            stripped = line.rstrip("\n")
            if dollar == 0 and stripped.endswith(";") and not stripped.startswith("--"):
                text = "".join(header_buf) + "".join(stmt)
                buckets[classify(text, "".join(header_buf))].append(text)
                stmt, header_buf = [], []
            elif dollar == 0 and all(l.strip().startswith("--") or not l.strip() for l in stmt):
                # только комментарии/пусто — копим как преамбулу
                header_buf.extend(stmt)
                stmt = []
    leftover = "".join(header_buf) + "".join(stmt)
    if leftover.strip():
        buckets["core"].append(leftover)

    for name, blocks in buckets.items():
        path = os.path.join(outdir, name if name != "core" else "core") + ".sql"
        with open(path, "w", encoding="utf-8") as f:
            f.write("".join(blocks))
    print({k: len(v) for k, v in buckets.items()})


if __name__ == "__main__":
    main()
