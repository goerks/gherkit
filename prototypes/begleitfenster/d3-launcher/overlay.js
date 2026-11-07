// Wird in JEDE Seite des gesteuerten Browsers eingeblendet (auch nach Navigation). Zeigt das Panel in einem
// Shadow DOM, verschiebbar und einklappbar. Zum Feld springen und Hervorheben passiert direkt in der Seite.
(function () {
  if (window.top !== window || window.__gkOverlay) return;
  window.__gkOverlay = true;

  function highlight(selector) {
    document.querySelectorAll('.gk-highlight').forEach(function (e) { e.classList.remove('gk-highlight'); });
    if (!document.getElementById('gk-hl-style')) {
      var s = document.createElement('style'); s.id = 'gk-hl-style';
      s.textContent = '.gk-highlight{outline:3px solid #f5a623 !important;outline-offset:3px !important;box-shadow:0 0 0 6px #f5a62355 !important}';
      document.documentElement.appendChild(s);
    }
    var el = null; try { el = document.querySelector(selector); } catch (e) { /* ungültig */ }
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('gk-highlight');
    if (/^(input|textarea|select|button)$/i.test(el.tagName)) { try { el.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
  }

  function boot() {
    window.__gkLoad().then(function (json) {
      var initial = json ? JSON.parse(json) : null;
      var host = document.createElement('div'); host.id = 'gk-host';
      host.style.cssText = 'position:fixed;right:16px;bottom:16px;width:350px;height:490px;z-index:2147483647;box-shadow:0 8px 30px #0006;border-radius:10px;overflow:hidden;resize:none';
      var root = host.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(host);

      var panel = GherkitPanel.mount(root, {
        scenarios: GK_SCENARIOS, keysOnPanel: true,
        load: function () { return initial; },
        save: function (s) { initial = s; window.__gkSave(JSON.stringify(s)); },
        locate: highlight,
        captureEvidence: function () { return window.__gkShot(); },
        onExport: function (name, json) { window.__gkExport(name, json); }
      });

      // verschieben (Kopfzeile) und einklappen (Doppelklick auf die Kopfzeile)
      var drag = null;
      root.addEventListener('mousedown', function (e) {
        var o = e.composedPath()[0];
        if (!o.closest || !o.closest('.gk-top') || o.tagName === 'BUTTON') return;
        var r = host.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!drag) return;
        host.style.left = Math.max(0, e.clientX - drag.dx) + 'px'; host.style.top = Math.max(0, e.clientY - drag.dy) + 'px';
        host.style.right = 'auto'; host.style.bottom = 'auto';
      });
      window.addEventListener('mouseup', function () { drag = null; });
      root.addEventListener('dblclick', function (e) {
        var o = e.composedPath()[0];
        if (o.closest && o.closest('.gk-top')) host.style.height = host.style.height === '40px' ? '490px' : '40px';
      });
      window.__gkPanel = panel;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
