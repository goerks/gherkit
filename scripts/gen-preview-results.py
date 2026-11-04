#!/usr/bin/env python3
"""Writes Cucumber JSON sample results for the .feature files of this repository.

The results feed the Render preview (render/, docs/render-preview.md): there the
real `gherkit report` command turns them into reports. They are sample data, not
the result of a test run: nearly everything passes, a few scenarios fail or are
undefined on purpose so that the report shows every status, and the @manual
scenarios get a made-up manual run (tester, comments, evidence).

Usage: python3 scripts/gen-preview-results.py   (from the repository root)
Output: render/results/{gherkit,examples,manual}.cucumber.json

The Gherkin reading below only knows what our own files use (English and
German keywords, Rule, Background, Outline, doc strings, tables, tags). The Go
test internal/report/preview_results_test.go checks the output against the
official parser.
"""
import json
import re
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "render" / "results"

KW = {
    "en": dict(feature=["Feature"], background=["Background"], rule=["Rule"],
               scenario=["Scenario", "Example"], outline=["Scenario Outline", "Scenario Template"],
               examples=["Examples", "Scenarios"],
               steps=["Given", "When", "Then", "And", "But", "*"]),
    "de": dict(feature=["Funktionalität", "Eigenschaft"], background=["Grundlage", "Hintergrund"], rule=["Regel"],
               scenario=["Szenario", "Beispiel"], outline=["Szenariogrundriss", "Szenario Grundriss"],
               examples=["Beispiele"],
               steps=["Angenommen", "Gegeben sei", "Gegeben seien", "Wenn", "Dann", "Und", "Aber", "*"]),
}


def kw_re(words):
    return re.compile(r"^(" + "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True)) + r")\s*:\s*(.*)$")


def cells(line):
    parts = re.split(r"(?<!\\)\|", line.strip())[1:-1]
    return [p.strip().replace("\\|", "|").replace("\\n", "\n").replace("\\\\", "\\") for p in parts]


def parse(path):
    """Returns (feature name, feature tags, [scenario dicts]) with outlines expanded."""
    lines = path.read_text(encoding="utf-8").splitlines()
    lang = "en"
    m = re.match(r"#\s*language:\s*(\S+)", lines[0]) if lines else None
    if m:
        lang = m.group(1)
    k = KW[lang]
    r_feature, r_bg, r_rule = kw_re(k["feature"]), kw_re(k["background"]), kw_re(k["rule"])
    r_sc, r_out, r_ex = kw_re(k["scenario"]), kw_re(k["outline"]), kw_re(k["examples"])
    r_step = re.compile(r"^(" + "|".join(re.escape(w) for w in sorted(k["steps"], key=len, reverse=True)) + r")\s+(.*)$")

    feature = {"name": "", "keyword": k["feature"][0], "tags": []}
    background, scenarios, pending_tags = [], [], []
    cur = None          # the scenario / background / examples block being filled
    last_step = None
    kind = None         # "background" | "scenario" | "examples"
    in_doc = None
    for no, raw in enumerate(lines, 1):
        s = raw.strip()
        if in_doc is not None:
            if s.startswith(in_doc["fence"]):
                last_step["doc"] = {"value": "\n".join(in_doc["lines"]), "type": in_doc["type"]}
                in_doc = None
            else:
                in_doc["lines"].append(raw[in_doc["indent"]:] if raw[:in_doc["indent"]].strip() == "" else raw.lstrip())
            continue
        if not s or s.startswith("#"):
            continue
        if s.startswith("@"):
            pending_tags += s.split()
            continue
        if s.startswith('"""') or s.startswith("```"):
            fence = s[:3]
            in_doc = {"fence": fence, "type": s[3:].strip(), "lines": [], "indent": len(raw) - len(raw.lstrip())}
            continue
        if s.startswith("|"):
            if kind == "examples":
                cur["rows"].append((no, cells(s)))
            elif last_step is not None:
                last_step.setdefault("table", []).append(cells(s))
            continue
        mm = r_feature.match(s)
        if mm:
            feature["name"], feature["tags"], pending_tags = mm.group(2), pending_tags, []
            continue
        if r_rule.match(s):
            pending_tags = []
            kind, last_step = None, None
            continue
        mm = r_bg.match(s)
        if mm:
            kind, cur, last_step = "background", {"steps": background}, None
            continue
        mm = r_out.match(s) or r_sc.match(s)
        if mm:
            outline = bool(r_out.match(s))
            cur = {"keyword": mm.group(1), "name": mm.group(2), "line": no, "tags": pending_tags, "steps": [],
                   "outline": outline, "examples": []}
            pending_tags, kind, last_step = [], "scenario", None
            scenarios.append(cur)
            continue
        mm = r_ex.match(s)
        if mm and scenarios:
            ex = {"tags": pending_tags, "header": None, "rows": []}
            pending_tags = []
            scenarios[-1]["examples"].append(ex)
            cur, kind, last_step = ex, "examples", None
            continue
        mm = r_step.match(s)
        if mm and kind in ("background", "scenario"):
            last_step = {"keyword": mm.group(1) + " ", "name": mm.group(2), "line": no}
            cur["steps"].append(last_step)
            continue
        # anything else is a free-text description

    out = []
    for sc in scenarios:
        if not sc["outline"]:
            out.append(dict(sc, steps=[dict(x) for x in background] + sc["steps"], example=None))
            continue
        n = 0
        for ex in sc["examples"]:
            if not ex["rows"]:
                continue
            header = ex["rows"][0][1]
            for line, row in ex["rows"][1:]:
                n += 1
                sub = lambda t: re.sub(r"<([^>]+)>", lambda g: row[header.index(g.group(1))] if g.group(1) in header else g.group(0), t)
                steps = []
                for st in background + sc["steps"]:
                    c = dict(st, name=sub(st["name"]))
                    if "doc" in st:
                        c["doc"] = dict(st["doc"], value=sub(st["doc"]["value"]))
                    if "table" in st:
                        c["table"] = [[sub(x) for x in r] for r in st["table"]]
                    steps.append(c)
                out.append(dict(sc, name=sub(sc["name"]), line=line, tags=sc["tags"] + ex["tags"], steps=steps,
                                example=n))
    return feature, out


def slug(text):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9äöüéèà]+", "-", text.lower())).strip("-")


def duration(seed):
    return 1_000_000 + zlib.crc32(seed.encode()) % 40_000_000  # 1 .. 41 ms in ns


# --- sample outcomes ---------------------------------------------------------
# (uri, scenario name regex) -> (status, index of the step it happens at, message)
FAIL = [
    ("examples/shop/broken.feature", r"Missing pipe", "failed", 0,
     "gherkin parse error: (6:7): inconsistent cell count within the table"),
    ("examples/shop/checkout.feature", r"Discount code NOPE", "failed", 2,
     "expected total 9.00 but got 0.00: unknown discount code NOPE\n    at checkout_steps.go:57"),
    ("examples/bibliothek/reservation.feature", r"Mehr als 5 Reservationen", "undefined", 0, ""),
]

MANUAL = {  # scenario name regex -> (tester's step outcomes, comment, evidence)
    r"Die Bestätigung kommt per E-Mail": ("passed", "Mail nach 40 Sekunden erhalten.", "evidence/bestaetigung-mail.svg"),
    r"Die Abholbenachrichtigung": ("failed", "Die Nachricht nennt den falschen Abholort (Filiale Nord statt Zentrum).", "evidence/abholort.svg"),
    r"Die Trefferliste": ("passed", "Layout in Chrome und Firefox geprüft.", None),
}


def status_for(uri, name, n_steps):
    for f_uri, rx, status, at, msg in FAIL:
        if uri == f_uri and re.search(rx, name):
            return status, min(at, n_steps - 1), msg
    return "passed", None, ""


def element(uri, fid, sc, idx):
    name = sc["name"]
    status, at, msg = status_for(uri, name, len(sc["steps"]))
    steps = []
    for i, st in enumerate(sc["steps"]):
        if at is None or i < at:
            res = {"status": "passed", "duration": duration(f"{uri}{name}{i}")}
        elif i == at:
            res = {"status": status, "duration": duration(f"{uri}{name}{i}")}
            if msg:
                res["error_message"] = msg
            if status == "undefined":
                res.pop("duration")
        else:
            res = {"status": "skipped"}
        cs = {"keyword": st["keyword"], "name": st["name"], "line": st["line"], "result": res}
        if "doc" in st:
            cs["doc_string"] = {"value": st["doc"]["value"], "content_type": st["doc"]["type"], "line": st["line"] + 1}
        if "table" in st:
            cs["rows"] = [{"cells": r} for r in st["table"]]
        steps.append(cs)
    eid = f"{fid};{slug(name)}" + (f";;{sc['example']}" if sc["example"] else "")
    return {"id": eid, "keyword": sc["keyword"].replace("Szenariogrundriss", "Szenariogrundriss"), "name": name,
            "description": "", "line": sc["line"], "type": "scenario",
            "tags": [{"name": t, "line": sc["line"] - 1} for t in sc["tags"]], "steps": steps}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    groups = {"gherkit": [], "examples": []}
    manual_features = []
    for path in sorted((ROOT / "features").rglob("*.feature")) + sorted((ROOT / "examples").rglob("*.feature")):
        uri = path.relative_to(ROOT).as_posix()
        feature, scenarios = parse(path)
        fid = slug(feature["name"]) or slug(path.stem)
        auto, manual = [], []
        for sc in scenarios:
            (manual if "@manual" in sc["tags"] else auto).append(sc)
        group = "gherkit" if uri.startswith("features/") else "examples"
        base = {"uri": uri, "id": fid, "keyword": feature["keyword"], "name": feature["name"], "description": "",
                "tags": [{"name": t, "line": 1} for t in feature["tags"]]}
        if auto:
            groups[group].append(dict(base, elements=[element(uri, fid, sc, i) for i, sc in enumerate(auto)]))
        if manual:
            els = []
            for sc in manual:
                el = element(uri, fid, sc, 0)
                outcome, comment, evidence = next((v for rx, v in MANUAL.items() if re.search(rx, sc["name"])),
                                                  ("passed", "", None))
                for i, cs in enumerate(el["steps"]):
                    last = i == len(el["steps"]) - 1
                    bad = outcome == "failed" and last
                    cs["result"] = {"status": "failed" if bad else "passed", "duration": 0}
                    info = {"status": "bad" if bad else "good", "at": "2026-11-04T09:%02d:00Z" % (10 + i)}
                    if last and comment:
                        info["comment"] = comment
                        if bad:
                            cs["result"]["error_message"] = comment
                    if last and evidence:
                        info["evidence"] = [evidence]
                    cs["gherkit"] = info
                    if outcome == "failed" and not last:
                        pass
                # one ignored step shows the "ignored" badge: second to last of a longer scenario
                if len(el["steps"]) > 3 and outcome == "passed" and "E-Mail" not in sc["name"]:
                    s2 = el["steps"][1]
                    s2["result"] = {"status": "skipped", "duration": 0}
                    s2["gherkit"] = {"status": "ignored", "comment": "Im Testumfeld nicht prüfbar (kein Mailserver).",
                                     "at": "2026-11-04T09:11:00Z"}
                el["gherkit"] = {"manual": True, "run": "20261104-091000-demo", "tester": "Anna Muster",
                                 "environment": "Test (Chrome 130)", "build": "preview",
                                 "started": "2026-11-04T09:10:00Z", "finished": "2026-11-04T09:30:00Z"}
                els.append(el)
            manual_features.append(dict(base, elements=els))

    for name, feats in (("gherkit", groups["gherkit"]), ("examples", groups["examples"]), ("manual", manual_features)):
        p = OUT / f"{name}.cucumber.json"
        p.write_text(json.dumps(feats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        n = sum(len(f["elements"]) for f in feats)
        print(f"{p.relative_to(ROOT)}: {len(feats)} features, {n} scenarios")


if __name__ == "__main__":
    main()
