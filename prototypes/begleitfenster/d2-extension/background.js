// Klick auf das Symbol öffnet die Seitenleiste. Wo es keine gibt (z. B. ältere Edge-Versionen),
// öffnet sich stattdessen ein kleines Fenster mit demselben Panel.
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
} else {
  chrome.action.onClicked.addListener(function () {
    chrome.windows.create({ url: 'panel.html', type: 'popup', width: 380, height: 560 });
  });
}
