import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fixed identity so dev and packaged builds share one data directory:
// %APPDATA%\DMP App on Windows.
app.setName('DMP App');
import { listModels, chat, abort, closeRuntime, getStatus, getSessionMap, restoreSessionMap, forgetSession, getHistory, updateSessionInstructions, setApprovalSink, replyPermission } from './runtime.js';
import { initStore, loadState, saveState } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Assistant links must never navigate the app window away.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  initStore(app.getPath('userData'));
  console.log('[dmp] userData:', app.getPath('userData'));
  ipcMain.handle('dmp:status', (_evt, opts) => getStatus(opts || {}));
  ipcMain.handle('dmp:models', () => listModels());
  ipcMain.handle('dmp:chat', (evt, payload) => {
    const key = payload?.key;
    return chat({
      ...(payload || {}),
      // onChunk can't cross IPC; forward snapshots to the sender window.
      onChunk: (text) => {
        const w = BrowserWindow.fromWebContents(evt.sender);
        w?.webContents.send('dmp:chat-chunk', { key, text });
      },
    });
  });
  ipcMain.handle('dmp:abort', (_evt, payload) => abort(payload || {}));
  ipcMain.handle('dmp:state:save', (_evt, payload) => {
    try {
      const res = saveState({ ...(payload || {}), sessions: getSessionMap() });
      console.log('[dmp] state saved:', (payload?.agents || []).length, 'agents');
      return res;
    } catch (e) {
      console.error('[dmp:state:save]', e?.message ?? e);
      return { ok: false, error: String(e?.message ?? e) };
    }
  });
  ipcMain.handle('dmp:state:load', () => {
    try {
      return { ok: true, state: loadState() };
    } catch (e) {
      console.error('[dmp:state:load]', e?.message ?? e);
      return { ok: false, error: String(e?.message ?? e), state: null };
    }
  });
  ipcMain.handle('dmp:session:history', (_evt, payload) => getHistory(payload?.key).catch((e) => {
    console.error('[dmp:session:history]', e?.message ?? e);
    return { messages: [], sessionID: null, error: String(e?.message ?? e) };
  }));
  ipcMain.handle('dmp:session:forget', (_evt, payload) => {
    forgetSession(payload?.key);
    return { ok: true };
  });
  ipcMain.handle('dmp:session:instructions', (_evt, payload) => updateSessionInstructions(payload?.keys, payload?.instructions, payload?.tools));
  // Approval requests (permission.asked) go to every window; the renderer
  // demultiplexes by conversation key and answers via dmp:permission:reply.
  setApprovalSink((req) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('dmp:permission-asked', req);
    }
  });
  ipcMain.handle('dmp:permission:reply', (_evt, payload) => replyPermission(payload || {}).catch((e) => {
    console.error('[dmp:permission:reply]', e?.message ?? e);
    return { ok: false, error: String(e?.message ?? e) };
  }));
  // Restore persisted conversation->session mappings in the background
  // (validated server-side; never blocks window creation). ensureSession
  // re-validates hits anyway, so this is map hygiene, not load-bearing.
  try {
    const saved = loadState();
    if (saved?.sessions) restoreSessionMap(saved.sessions).catch((e) => console.error('[dmp:restore]', e?.message ?? e));
  } catch (e) {
    console.error('[dmp:restore]', e?.message ?? e);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  closeRuntime().catch(() => {});
});
