const { app, BrowserWindow, globalShortcut, Menu, Tray, shell, nativeImage } = require("electron");
const path = require("path");

let mainWindow = null;
let tray = null;

const isDev = process.env.ELECTRON_START_URL || process.env.NODE_ENV === "development";
const startUrl =
  process.env.ELECTRON_START_URL ||
  process.env.TAXIHUB_TERMINAL_URL ||
  (isDev
    ? "http://localhost:3000/terminal"
    : `file://${path.join(__dirname, "../build/index.html")}`);

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0B0D10",
    title: "TaxiHub — Terminal de Operadora (Windows Native)",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Mantener WebSockets y alertas activas siempre
    },
  });

  mainWindow.loadURL(startUrl);

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Abrir enlaces externos en el navegador predeterminado
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerShortcuts() {
  // Atajo global en Windows para traer la Terminal al frente al instante
  globalShortcut.register("CommandOrControl+Shift+T", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();

  const template = [
    {
      label: "TaxiHub Operadora",
      submenu: [
        { label: "Recargar Terminal (F5)", accelerator: "F5", click: () => mainWindow?.reload() },
        {
          label: "Pantalla Completa (F11)",
          accelerator: "F11",
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: "separator" },
        {
          label: "Herramientas de Diagnóstico",
          accelerator: "CommandOrControl+Shift+I",
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        { type: "separator" },
        { label: "Salir", accelerator: "Alt+F4", click: () => app.quit() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
