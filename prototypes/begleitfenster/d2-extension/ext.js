// Verbindet das Panel mit dem Browser: Zustand in chrome.storage, Hervorhebung in der aktiven Seite,
// Nachweis als Screenshot der sichtbaren Seite (ohne Bildschirmfreigabe).
(function () {
  var KEY = 'gk-proto-d2';
  function lastNormalTab() {
    return chrome.windows.getLastFocused({ windowTypes: ['normal'] }).then(function (w) {
      return chrome.tabs.query({ active: true, windowId: w.id }).then(function (t) { return { win: w, tab: t[0] }; });
    });
  }
  function start(initial) {
    var cache = initial;
    GherkitPanel.mount(document.getElementById('root'), {
      scenarios: GK_SCENARIOS,
      load: function () { return cache; },
      save: function (s) { cache = s; var o = {}; o[KEY] = s; chrome.storage.local.set(o); },
      locate: function (selector) {
        lastNormalTab().then(function (x) { return chrome.tabs.sendMessage(x.tab.id, { type: 'gk-locate', selector: selector }); }).catch(function () { /* Seite ohne Skript, z. B. chrome:// */ });
      },
      captureEvidence: function () {
        return lastNormalTab().then(function (x) { return chrome.tabs.captureVisibleTab(x.win.id, { format: 'png' }); });
      }
    });
  }
  chrome.storage.local.get(KEY).then(function (o) { start(o[KEY] || null); });
})();
