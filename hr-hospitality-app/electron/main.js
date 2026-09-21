/* eslint-disable */
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV !== 'production';

const configFilePath = path.join(app.getPath('userData'), 'app_config.json');
const buildConfigPath = path.join(__dirname, 'build_config.json');

// ─── Configuração ────────────────────────────────────────────────────────────

function loadConfig() {
  let buildConfig = { mode: 'server' };
  let savedConfig = { mode: 'server', serverIp: '' };

  try {
    if (fs.existsSync(buildConfigPath)) {
      buildConfig = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8'));
    }
  } catch (e) {
    console.error('[ElectronMain] Falha ao ler build_config.json:', e);
  }

  try {
    if (fs.existsSync(configFilePath)) {
      savedConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    } else {
      savedConfig = { mode: buildConfig.mode || 'server', serverIp: '' };
      fs.writeFileSync(configFilePath, JSON.stringify(savedConfig, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('[ElectronMain] Falha ao ler app_config.json:', e);
  }

  return {
    mode: savedConfig.mode || buildConfig.mode || 'server',
    serverIp: savedConfig.serverIp || ''
  };
}

function saveConfig(newConfig) {
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2), 'utf8');
    console.log('[ElectronMain] Configurações guardadas:', newConfig);
  } catch (e) {
    console.error('[ElectronMain] Falha ao guardar app_config.json:', e);
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.on('get-app-config', (event) => {
  event.returnValue = loadConfig();
});

ipcMain.on('save-app-config', (event, newConfig) => {
  saveConfig(newConfig);
});

// ─── Janela Principal ─────────────────────────────────────────────────────────

function getIconPath(mode) {
  const iconFile = mode === 'server' ? 'icon-server.png' : 'icon-client.png';
  
  // Em produção, os assets ficam em resources/
  const prodPath = path.join(process.resourcesPath || __dirname, '..', 'public', iconFile);
  const devPath  = path.join(__dirname, '..', 'public', iconFile);
  
  if (!isDev && fs.existsSync(prodPath)) return prodPath;
  if (fs.existsSync(devPath)) return devPath;
  
  // Fallback ao favicon
  return path.join(__dirname, '..', 'public', 'favicon.ico');
}

function createWindow(config) {
  const isServer = config.mode === 'server';
  const iconPath  = getIconPath(config.mode);
  const title     = isServer
    ? 'HR Hospitality — Servidor'
    : 'HR Hospitality — Cliente';

  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 360,
    minHeight: 600,
    title,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#111827', // Evita flash branco no load
    show: false,                // Mostrar apenas depois de carregar
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../out/index.html'));
  }

  // Mostrar janela suavemente após carregar
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  return win;
}

// ─── System Tray (apenas Modo Servidor) ──────────────────────────────────────

let tray = null;

function createServerTray(win, config) {
  if (config.mode !== 'server') return;

  try {
    const iconPath = getIconPath('server');
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
      { label: '🟢 Servidor Ativo na porta 3002', enabled: false },
      { type: 'separator' },
      { label: 'Abrir HR Hospitality', click: () => { win.show(); win.focus(); } },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() }
    ]);

    tray.setToolTip('HR Hospitality — Servidor Local Ativo');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => { win.show(); win.focus(); });

    console.log('[ElectronMain] Ícone de tray criado com sucesso.');
  } catch (e) {
    console.warn('[ElectronMain] Não foi possível criar ícone de tray:', e.message);
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  process.env.USER_DATA_PATH = app.getPath('userData');

  const config = loadConfig();
  console.log('[ElectronMain] ════════════════════════════════════');
  console.log(`[ElectronMain] HR HOSPITALITY — Modo: ${config.mode.toUpperCase()}`);
  console.log('[ElectronMain] ════════════════════════════════════');
  console.log(`[ElectronMain] UserData: ${app.getPath('userData')}`);

  if (config.mode === 'server') {
    try {
      console.log('[ElectronMain] A iniciar Servidor Express SQLite (porta 3002)...');
      require('./server.js');
      console.log('[ElectronMain] ✔ Servidor local iniciado com sucesso.');
    } catch (err) {
      console.error('[ElectronMain] ✖ Falha ao iniciar servidor local:', err);
    }
  } else {
    console.log(`[ElectronMain] Modo CLIENTE — Servidor remoto: ${config.serverIp || 'não configurado'}`);
  }

  const win = createWindow(config);
  createServerTray(win, config);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(config);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (tray) { tray.destroy(); tray = null; }
    app.quit();
  }
});
