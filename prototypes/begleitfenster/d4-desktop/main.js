// Prototyp D4: kleines Desktop-Fenster, das immer im Vordergrund bleibt, unabhängig davon, welche Anwendung
// getestet wird (auch Desktop-Software). Nachweis = Screenshot des ganzen Bildschirms.
const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');

let win;
function create() {
  win = new BrowserWindow({
    width: 360, height: 540, minWidth: 300, minHeight: 300, frame: false, alwaysOnTop: true, title: 'gherkit Begleitfenster',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setAlwaysOnTop(true, 'screen-saver'); // auch über Vollbild-Anwendungen
  win.loadFile('index.html');
}

ipcMain.handle('gk-shot', async () => {
  win.hide(); // sich selbst nicht fotografieren
  await new Promise(r => setTimeout(r, 300));
  try {
    const d = screen.getPrimaryDisplay(), f = d.scaleFactor || 1;
    const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.size.width * f), height: Math.round(d.size.height * f) } });
    return srcs[0].thumbnail.toDataURL();
  } finally { win.show(); }
});
ipcMain.handle('gk-win', (_e, what) => { if (what === 'close') app.quit(); else if (what === 'min') win.minimize(); });

app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
