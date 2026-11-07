// Ergebnis eines manuellen Laufs als Xray-JSON (Import «Test Execution results»).
// Das Format ist nach der Xray-Dokumentation nachgebaut und noch NICHT gegen eine echte Instanz geprüft.
(function (g) {
  'use strict';
  var STATUS = { passed: 'PASS', failed: 'FAIL', ignored: 'TODO' }; // «ignoriert» → TODO oder ABORTED: offen (Konzept Abschnitt 6)

  function scenarioStatus(steps) {
    var s = steps.map(function (x) { return x && x.status; });
    if (s.indexOf('failed') >= 0) return 'FAIL';
    if (s.indexOf('ignored') >= 0) return 'TODO';
    if (s.every(function (x) { return x === 'passed'; })) return 'PASS';
    return 'TODO';
  }

  function build(scenarios, state, info) {
    info = info || {};
    var tests = scenarios.map(function (sc, si) {
      var steps = sc.steps.map(function (_, i) { return state.res[si + ':' + i] || {}; });
      var evid = [];
      var out = steps.map(function (r, i) {
        var e = (r.ev || []).map(function (x, n) { return { filename: 'schritt' + (i + 1) + '-' + (n + 1) + '.png', contentType: 'image/png', data: String(x.data).replace(/^data:[^,]*,/, '') }; });
        evid = evid.concat(e);
        return { status: STATUS[r.status] || 'TODO', comment: r.note || '', actualResult: r.status === 'failed' ? (r.note || '') : '' };
      });
      return { testKey: sc.testKey, status: scenarioStatus(steps), comment: sc.feature + ': ' + sc.name, steps: out, evidences: evid, defects: [] };
    });
    return {
      info: { summary: info.summary || 'Manueller Lauf (gherkit)', description: 'Erzeugt von gherkit, Prototyp Begleitfenster', user: info.tester || '', startDate: new Date(state.started || Date.now()).toISOString(), finishDate: new Date().toISOString() },
      tests: tests
    };
  }
  g.GherkitXray = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
