// Syntax highlighting driven by the tokens of the official Gherkin scanner
// (returned by /api/parse). No grammar is duplicated here: the server tells
// us what each line is, we only decide how it looks.
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Highlights quoted strings, <placeholders> and numbers inside step text.
  function stepText(text, cls) {
    cls = cls || { str: 'c-str', ph: 'c-ph', num: 'c-num' };
    var re = /("[^"]*"|'[^']*'|<[^<>\s][^<>]*>|\b\d+(?:[.,]\d+)?\b)/g;
    var out = '', last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      var t = m[0], c = t[0] === '<' ? cls.ph : (t[0] === '"' || t[0] === "'") ? cls.str : cls.num;
      out += '<span class="' + c + '">' + esc(t) + '</span>';
      last = m.index + t.length;
    }
    return out + esc(text.slice(last));
  }

  function tableRow(line, head) {
    var out = '', cell = '', i = 0, inCell = false;
    var cellCls = 'c-cell' + (head ? ' c-head' : '');
    var lead = line.match(/^\s*/)[0];
    out += esc(lead);
    for (i = lead.length; i < line.length; i++) {
      var ch = line[i];
      if (ch === '\\' && i + 1 < line.length) { cell += ch + line[i + 1]; i++; continue; }
      if (ch === '|') {
        if (inCell) out += '<span class="' + cellCls + '">' + stepText(cell, { str: 'c-str', ph: 'c-ph', num: 'c-num' }) + '</span>';
        cell = ''; inCell = true;
        out += '<span class="c-pipe">|</span>';
      } else {
        cell += ch;
      }
    }
    return out + esc(cell);
  }

  function tagLine(line, items) {
    var out = '', pos = 0;
    (items || []).forEach(function (it) {
      var start = it.column - 1;
      out += esc(line.slice(pos, start));
      out += '<span class="c-tag">' + esc(line.substr(start, it.text.length)) + '</span>';
      pos = start + it.text.length;
    });
    var rest = line.slice(pos);
    var ci = rest.indexOf('#');
    if (ci >= 0) return out + esc(rest.slice(0, ci)) + '<span class="c-comment">' + esc(rest.slice(ci)) + '</span>';
    return out + esc(rest);
  }

  var blockClass = {
    FeatureLine: 'c-kw-feature', RuleLine: 'c-kw-rule', BackgroundLine: 'c-kw-background',
    ScenarioLine: 'c-kw-scenario', ExamplesLine: 'c-kw-examples'
  };

  // lines: string[]; tokens: parse tokens; bad: Set of 1-based line numbers with errors.
  function highlight(lines, tokens, bad) {
    var byLine = {};
    (tokens || []).forEach(function (t) { byLine[t.line] = t; });
    var html = [], inDoc = false, prevType = '', prevBlock = '', lastKwType = 'Context';
    for (var n = 1; n <= lines.length; n++) {
      var line = lines[n - 1], t = byLine[n], h;
      var type = t ? t.type : '';
      if (type === 'DocStringSeparator') {
        var i = line.indexOf(t.keyword);
        h = esc(line.slice(0, i)) + '<span class="c-docsep">' + esc(t.keyword) + '</span>' +
          (t.text ? '<span class="c-media">' + esc(line.slice(i + t.keyword.length)) + '</span>' : esc(line.slice(i + t.keyword.length)));
        inDoc = !inDoc;
      } else if (inDoc) {
        h = '<span class="c-doc">' + esc(line) + '</span>';
      } else if (!t) {
        h = esc(line);
      } else if (type === 'Comment') {
        h = '<span class="c-comment">' + esc(line) + '</span>';
      } else if (type === 'Language') {
        h = '<span class="c-lang">' + esc(line) + '</span>';
      } else if (type === 'TagLine') {
        h = tagLine(line, t.items);
      } else if (blockClass[type]) {
        var k = line.indexOf(t.keyword);
        var after = line.slice(k + t.keyword.length);
        var colon = after.indexOf(':');
        h = esc(line.slice(0, k)) + '<span class="' + blockClass[type] + '">' + esc(t.keyword) + '</span>' +
          esc(after.slice(0, colon + 1)) + '<span class="c-name">' + esc(after.slice(colon + 1)) + '</span>';
        prevBlock = type;
      } else if (type === 'StepLine') {
        var ks = line.indexOf(t.keyword);
        var kt = t.keywordType || 'Unknown';
        if (kt !== 'Conjunction' && kt !== 'Unknown') lastKwType = kt;
        h = esc(line.slice(0, ks)) + '<span class="c-k-' + kt + '">' + esc(t.keyword) + '</span>' + stepText(line.slice(ks + t.keyword.length));
      } else if (type === 'TableRow') {
        h = tableRow(line, prevType !== 'TableRow' && prevBlock === 'ExamplesLine');
      } else if (type === 'Other') {
        h = '<span class="c-desc">' + esc(line) + '</span>';
      } else {
        h = esc(line);
      }
      if (type && type !== 'Comment' && type !== 'Empty') prevType = type;
      html.push('<span class="ln' + (bad && bad.has(n) ? ' bad' : '') + '">' + (h || ' ') + '</span>');
    }
    return html.join('');
  }

  global.GherkitHL = { highlight: highlight, stepText: stepText, esc: esc };
})(window);
