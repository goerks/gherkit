#!/usr/bin/env python3
"""Baut den interaktiven Prototyp «Run-Tab mit Begleitfenster» als einzelne HTML-Datei.

Er nimmt den ECHTEN Code des Editors (internal/server/web/run.js und style.css) und die manuellen Szenarien aus
examples/bibliothek; nur der Server (/api/manual/*) wird in der Seite nachgebaut. Drei Stellen in run.js werden
beim Bauen angepasst (siehe PATCHES), weil Bilder und Bildschirmfreigabe in einem Artifact nicht gehen.
"""
import json, pathlib, re

here = pathlib.Path(__file__).parent
repo = here.parents[2]
web = repo / 'internal' / 'server' / 'web'
KW = ('Angenommen', 'Wenn', 'Dann', 'Und', 'Aber', 'Gegeben sei')


def parse(path):
    """Kleiner Gherkin-Leser, nur für die Beispiel-Features (Hintergrund, Szenarien, Grundrisse, Tabellen)."""
    feature, bg, cases = '', [], []
    cur = None          # aktuelles Szenario oder None
    tags, mode, last_step, in_examples, ex_rows = [], '', None, False, []
    def flush():
        nonlocal cur, ex_rows
        if cur is None: return
        if cur['outline']:
            head, *rows = ex_rows
            for r in rows:
                sub = {h: v for h, v in zip(head, r)}
                steps = []
                for s in cur['steps']:
                    t = re.sub(r'<([^>]+)>', lambda m: sub.get(m.group(1), m.group(0)), s['text'])
                    steps.append({**s, 'text': t})
                cases.append({'name': cur['name'], 'tags': cur['tags'], 'steps': bg_steps() + steps, 'example': ', '.join(f'{h}: {v}' for h, v in sub.items())})
        else:
            cases.append({'name': cur['name'], 'tags': cur['tags'], 'steps': bg_steps() + cur['steps'], 'example': ''})
        cur = None; ex_rows = []
    def bg_steps(): return [dict(s) for s in bg]
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('@'):
            flush(); tags = line.split(); continue
        m = re.match(r'(Funktionalität|Feature):\s*(.*)', line)
        if m: feature = m.group(2); mode = 'feature'; continue
        if re.match(r'(Grundlage|Hintergrund|Background):', line): flush(); mode = 'bg'; last_step = None; continue
        m = re.match(r'(Szenariogrundriss|Szenario|Scenario Outline|Scenario):\s*(.*)', line)
        if m:
            flush(); mode = 'sc'; in_examples = False
            cur = {'name': m.group(2), 'tags': tags, 'steps': [], 'outline': m.group(1) in ('Szenariogrundriss', 'Scenario Outline')}
            tags = []; last_step = None; continue
        if re.match(r'(Beispiele|Examples):', line): in_examples = True; continue
        if line.startswith('|'):
            row = [c.strip() for c in line.strip('|').split('|')]
            if in_examples: ex_rows.append(row)
            elif last_step is not None: last_step.setdefault('rows', []).append(row)
            continue
        for k in KW:
            if line.startswith(k + ' '):
                step = {'keyword': k + ' ', 'text': line[len(k) + 1:]}
                (bg if mode == 'bg' else cur['steps']).append(step); last_step = step
                break
    flush()
    return feature, cases


cases = []
for f in sorted((repo / 'examples' / 'bibliothek').glob('*.feature')):
    # der Hintergrund gilt je Datei: neu lesen
    bg = []
    name, cs = parse(f)
    for c in cs:
        if '@manual' in c['tags']:
            cases.append({'uri': 'bibliothek/' + f.name, 'feature': name, **c})
for i, c in enumerate(cases, 1):
    c['id'] = 'c%d' % i

# ---------- Anpassungen an run.js (nur für diese Seite) ----------
run = (web / 'run.js').read_text(encoding='utf-8')
PATCHES = [
    # 1. Nachweisbilder kommen aus dem Speicher der Seite, nicht vom Server (ein <img> geht nicht durch fetch)
    ("function evidenceUrl(rel) { return url('/' + rel.split('/').map(encodeURIComponent).join('/')); }",
     "function evidenceUrl(rel) { return window.__gkEvidence ? window.__gkEvidence(R.run.id, rel) : url('/' + rel.split('/').map(encodeURIComponent).join('/')); }"),
    # 2. Screenshot: in einem Artifact gibt es keine Bildschirmfreigabe, die Seite liefert ein simuliertes Bild
    ("function cmpShot(cs, i) {\n",
     "function cmpShot(cs, i) {\n    if (window.__gkShotSim) { window.__gkShotSim().then(function (blob) { return upload(cs.id, i, [{ file: blob, name: 'screenshot-' + Date.now() + '.png' }]); }); return; }\n"),
]
for old, new in PATCHES:
    assert old in run, 'Stelle in run.js nicht gefunden: ' + old[:50]
    run = run.replace(old, new, 1)

css = (web / 'style.css').read_text(encoding='utf-8')
tpl = (here / 'run-tab.html').read_text(encoding='utf-8')
out = tpl.replace('/*STYLE*/', css).replace('/*RUNJS*/', run.replace('</script>', '<\\/script>')).replace('/*CASES*/', json.dumps(cases, ensure_ascii=False))
dest = repo / 'prototypes' / '_dist' / 'run-tab-artifact.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(out, encoding='utf-8')
print(dest, len(out), 'Testfälle:', len(cases), [len(c['steps']) for c in cases])
