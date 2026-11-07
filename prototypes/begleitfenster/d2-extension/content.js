// Läuft in jeder Seite. Das Panel sagt «hebe #vorname hervor», die Seite scrollt hin, markiert und fokussiert das Feld.
(function () {
  var STYLE_ID = 'gk-highlight-style', CLS = 'gk-highlight';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style'); s.id = STYLE_ID;
    s.textContent = '.' + CLS + '{outline:3px solid #f5a623 !important;outline-offset:3px !important;box-shadow:0 0 0 6px #f5a62355 !important;transition:box-shadow .3s}';
    document.documentElement.appendChild(s);
  }
  function clear() { document.querySelectorAll('.' + CLS).forEach(function (e) { e.classList.remove(CLS); }); }
  chrome.runtime.onMessage.addListener(function (msg, _sender, reply) {
    if (!msg || msg.type !== 'gk-locate') return;
    clear(); ensureStyle();
    var el = null;
    try { el = document.querySelector(msg.selector); } catch (e) { /* ungültiger Selektor */ }
    if (!el) { reply({ found: false }); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add(CLS);
    if (/^(input|textarea|select|button)$/i.test(el.tagName)) { try { el.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
    reply({ found: true });
  });
})();
