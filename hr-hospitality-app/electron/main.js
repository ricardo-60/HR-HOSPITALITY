/* eslint-disable */
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { TENANT_ID } = require('./operations');

const isDev = !app.isPackaged;
let mainWindow = null;
let localRuntime = null;
let localServer = null;

function configFilePath() {
  return path.join(app.getPath('userData'), 'app_config.json');
}

function authStorePath() {
  return path.join(app.getPath('userData'), 'supabase-auth-store.bin');
}

function loadPublicSupabaseConfig() {
  const candidates = [
    { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    (() => {
      try {
        const file = path.join(__dirname, 'public-config.json');
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch { /* generated config may be absent */ }
      return {};
    })(),
    (() => {
      try {
        const file = path.join(__dirname, '..', '.env.local');
        if (!fs.existsSync(file)) return {};
        const values = {};
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
          const match = line.match(/^\s*(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)\s*=\s*([^#\r\n]+)\s*$/);
          if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
        }
        return values;
      } catch { return {}; }
    })()
  ];
  for (const candidate of candidates) {
    if (candidate.supabaseUrl && candidate.supabaseAnonKey) {
      return { supabaseUrl: candidate.supabaseUrl.replace(/\/$/, ''), supabaseAnonKey: candidate.supabaseAnonKey };
    }
  }
  return null;
}

function loadConfig() {
  let buildConfig = { mode: 'server' };
  let savedConfig = { mode: buildConfig.mode, serverIp: '' };
  const buildConfigPaths = [
    ...(isDev ? [] : [
      path.join(process.resourcesPath || '', 'electron', 'build_config.json'),
      path.join(process.resourcesPath || '', 'build_config.json')
    ]),
    path.join(__dirname, 'build_config.json')
  ].filter(Boolean);

  try {
    const buildConfigPath = buildConfigPaths.find(candidate => fs.existsSync(candidate));
    if (buildConfigPath) buildConfig = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8'));
  } catch (error) {
    console.error('[ElectronMain] Invalid build_config.json:', error.message);
  }

  try {
    const file = configFilePath();
    if (fs.existsSync(file)) savedConfig = JSON.parse(fs.readFileSync(file, 'utf8'));
    else fs.writeFileSync(file, JSON.stringify(savedConfig, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.error('[ElectronMain] Could not read app configuration:', error.message);
  }

  const mode = savedConfig.mode === 'client' || buildConfig.mode === 'client' ? 'client' : 'server';
  const serverIp = typeof savedConfig.serverIp === 'string' ? savedConfig.serverIp.trim() : '';
  return { mode, serverIp };
}

function saveConfig(input) {
  const current = loadConfig();
  const next = {
    mode: input?.mode === 'client' ? 'client' : 'server',
    serverIp: typeof input?.serverIp === 'string' ? input.serverIp.trim().slice(0, 255) : current.serverIp
  };
  fs.writeFileSync(configFilePath(), JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  return next;
}

function assertTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('Untrusted IPC sender.');
  }
}

let authStoreCache = null;
let authStoreLoaded = false;
function loadAuthStore() {
  if (authStoreLoaded) return authStoreCache;
  authStoreLoaded = true;
  authStoreCache = {};
  try {
    const file = authStorePath();
    if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) return authStoreCache;
    const decrypted = safeStorage.decryptString(fs.readFileSync(file));
    const parsed = JSON.parse(decrypted);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) authStoreCache = parsed;
  } catch (error) {
    console.error('[ElectronMain] Auth secure storage could not be read:', error.message);
    authStoreCache = {};
  }
  return authStoreCache;
}

function saveAuthStore() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const encrypted = safeStorage.encryptString(JSON.stringify(authStoreCache || {}));
  fs.writeFileSync(authStorePath(), encrypted, { mode: 0o600 });
  return true;
}

const principalCache = new Map();

function getStoredAccessToken() {
  for (const value of Object.values(loadAuthStore())) {
    try {
      const parsed = JSON.parse(value);
      const expiresAt = Number(parsed?.expires_at || parsed?.session?.expires_at || 0);
      if (typeof parsed?.access_token === 'string' && parsed.access_token.length > 20 && expiresAt > Math.floor(Date.now() / 1000)) {
        return parsed.access_token;
      }
    } catch { /* ignore malformed storage values */ }
  }
  return null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

async function resolvePrincipal() {
  const token = getStoredAccessToken();
  if (!token) throw new Error('A valid Supabase session is required.');
  const config = loadPublicSupabaseConfig();
  if (!config) throw new Error('Supabase public configuration is missing.');

  const cacheKey = createHash('sha256').update(token).digest('hex');
  const cached = principalCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.principal;

  const headers = { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` };
  const authResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers,
    signal: AbortSignal.timeout(5000)
  });
  if (!authResponse.ok) throw new Error('Supabase session validation failed.');
  const authUser = await authResponse.json();
  if (!authUser?.id) throw new Error('Supabase session has no user.');

  const profileResponse = await fetch(
    `${config.supabaseUrl}/rest/v1/app_users?auth_user_id=eq.${encodeURIComponent(authUser.id)}&select=auth_user_id,tenant_id,role,status,allowed_modules,restrictions`,
    { headers, signal: AbortSignal.timeout(5000) }
  );
  if (!profileResponse.ok) throw new Error('User profile could not be loaded.');
  const profiles = await profileResponse.json();
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile || profile.status !== 'ATIVO' || profile.tenant_id !== TENANT_ID) {
    throw new Error('Active profile for this hotel is required.');
  }
  const principal = {
    userId: authUser.id,
    tenantId: profile.tenant_id,
    role: profile.role,
    status: profile.status,
    allowedModules: arrayValue(profile.allowed_modules),
    restrictions: arrayValue(profile.restrictions)
  };
  principalCache.set(cacheKey, { principal, expiresAt: Date.now() + 5_000 });
  return principal;
}

function canUseModule(principal, moduleName) {
  if (principal.role === 'ADMINISTRATOR') return true;
  if (principal.restrictions.some(value => value === `/${moduleName}` || value === moduleName)) return false;
  if (principal.role === 'PERMISSAO') return true;
  return principal.allowedModules.includes('*') || principal.allowedModules.includes(moduleName);
}

function authorizeLocalOperation(principal, operation, input = {}) {
  if (operation === 'system.health' || operation.startsWith('sync.')) return;
  if (operation === 'reservations.activeGuests' || operation === 'pos.postConsumption') {
    if (!canUseModule(principal, 'pos') && !canUseModule(principal, 'alojamento')) throw new Error('Module permission required.');
    return;
  }
  if (operation.startsWith('data.')) {
    const resource = input.resource;
    const moduleName = resource === 'hotel_consumptions'
      ? 'pos'
      : resource === 'hotel_rooms' || resource === 'hotel_reservations'
        ? 'alojamento'
        : null;
    if (moduleName && !canUseModule(principal, moduleName)) throw new Error('Module permission required.');
  }
}

function validAuthStorageKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 200 && key.startsWith('sb-');
}

ipcMain.on('get-app-config', event => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  event.returnValue = loadConfig();
});

ipcMain.on('save-app-config', (event, input) => {
  try {
    assertTrustedSender(event);
    saveConfig(input);
  } catch (error) {
    console.error('[ElectronMain] Configuration update rejected:', error.message);
  }
});

ipcMain.on('auth-storage-get', (event, key) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  if (!validAuthStorageKey(key)) return;
  const value = loadAuthStore()[key];
  event.returnValue = typeof value === 'string' ? value : null;
});

ipcMain.on('auth-storage-set', (event, key, value) => {
  try {
    assertTrustedSender(event);
    if (!validAuthStorageKey(key) || typeof value !== 'string' || value.length > 200_000) return;
    loadAuthStore()[key] = value;
    principalCache.clear();
    saveAuthStore();
  } catch (error) {
    console.error('[ElectronMain] Auth secure storage update rejected:', error.message);
  }
});

ipcMain.on('auth-storage-remove', (event, key) => {
  try {
    assertTrustedSender(event);
    if (!validAuthStorageKey(key)) return;
    delete loadAuthStore()[key];
    principalCache.clear();
    saveAuthStore();
  } catch (error) {
    console.error('[ElectronMain] Auth secure storage removal rejected:', error.message);
  }
});

ipcMain.handle('local-db-operation', async (event, request) => {
  assertTrustedSender(event);
  if (!localRuntime) throw new Error('Local database is only available in server mode.');
  if (!request || typeof request.operation !== 'string' || request.operation.length > 100) {
    throw new Error('Invalid local operation.');
  }
  if (request.operation !== 'system.health') {
    const principal = await resolvePrincipal();
    authorizeLocalOperation(principal, request.operation, request.input || {});
  }
  return localRuntime.execute(request.operation, request.input || {});
});

ipcMain.handle('voice-transcribe', async (event, request) => {
  assertTrustedSender(event);
  if (!localRuntime) throw new Error('Voice engine is only available in server mode.');
  await resolvePrincipal();
  if (!request || typeof request.audioBase64 !== 'string' || request.audioBase64.length > 36_000_000) {
    throw new Error('Invalid audio payload.');
  }
  const audio = Buffer.from(request.audioBase64, 'base64');
  return localRuntime.transcribe(audio, request.language || 'pt');
});

function getIconPath(mode) {
  const iconFile = mode === 'server' ? 'icon-server.png' : 'icon-client.png';
  const prodPath = path.join(process.resourcesPath || __dirname, '..', 'public', iconFile);
  const devPath = path.join(__dirname, '..', 'public', iconFile);
  if (!isDev && fs.existsSync(prodPath)) return prodPath;
  if (fs.existsSync(devPath)) return devPath;
  return path.join(__dirname, '..', 'public', 'favicon.ico');
}

function createWindow(config) {
  const title = config.mode === 'server'
    ? 'HR Hospitality — Servidor'
    : 'HR Hospitality — Cliente';

  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 360,
    minHeight: 600,
    title,
    icon: getIconPath(config.mode),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    backgroundColor: '#111827',
    show: false
  });

  mainWindow = win;
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev && url.startsWith('http://localhost:3000');
    if (!allowed) event.preventDefault();
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../out/index.html'));
  }

  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  return win;
}

function createServerTray(win) {
  try {
    const icon = nativeImage.createFromPath(getIconPath('server')).resize({ width: 16, height: 16 });
    const tray = new Tray(icon);
    const contextMenu = Menu.buildTemplate([
      { label: 'HR Hospitality — Servidor Seguro', enabled: false },
      { type: 'separator' },
      { label: 'Abrir HR Hospitality', click: () => { win.show(); win.focus(); } },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() }
    ]);
    tray.setToolTip('HR Hospitality — Servidor local ativo');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => { win.show(); win.focus(); });
    return tray;
  } catch (error) {
    console.warn('[ElectronMain] Tray unavailable:', error.message);
    return null;
  }
}

let tray = null;

app.whenReady().then(async () => {
  process.env.USER_DATA_PATH = app.getPath('userData');
  const config = loadConfig();
  console.log(`[ElectronMain] HR HOSPITALITY — ${config.mode.toUpperCase()}`);

  if (config.mode === 'server') {
    try {
      const { createRuntime, startServer } = require('./server');
      localRuntime = createRuntime({ userDataPath: app.getPath('userData') });
      const crypto = require('node:crypto');
      const apiToken = process.env.HOSPITALITY_API_TOKEN || crypto.randomBytes(32).toString('base64url');
      localServer = startServer({ runtime: localRuntime, apiToken });
    } catch (error) {
      console.error('[ElectronMain] Secure local server failed to start:', error.message);
      app.quit();
      return;
    }
  }

  const win = createWindow(config);
  if (config.mode === 'server') tray = createServerTray(win);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(loadConfig());
  });
});

app.on('before-quit', () => {
  try { if (localServer) localServer.close(); } catch { /* ignore */ }
  try { if (localRuntime) localRuntime.close(); } catch { /* ignore */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
