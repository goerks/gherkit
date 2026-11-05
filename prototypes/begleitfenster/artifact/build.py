#!/usr/bin/env python3
"""Baut die Artifact-Seite: setzt common/scenario.js, xray.js und panel.js in seite.html ein."""
import pathlib
here = pathlib.Path(__file__).parent
common = '\n'.join((here.parent / 'common' / f).read_text() for f in ('scenario.js', 'xray.js', 'panel.js'))
out = here.parent.parent / '_dist' / 'begleitfenster-artifact.html'
out.parent.mkdir(exist_ok=True)
out.write_text((here / 'seite.html').read_text().replace('/*COMMON*/', common.replace('</script>', '<\\/script>')))
print(out, out.stat().st_size)
