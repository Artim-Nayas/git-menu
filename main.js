import { app, BrowserWindow, Tray, ipcMain, shell, nativeImage, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import util from 'util';
import { classifyGhFailure } from './lib/gh-errors.js';
import { filterInbox, normalizeNotification } from './lib/notifications.js';
import { defaultSettings, mergeSettings } from './lib/settings.js';

const execFilePromise = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;
let window = null;

const isDev = process.env.NODE_ENV === 'development';

// Setup environment to ensure gh can be found when packaged
const ghEnv = { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };

let settings = defaultSettings();

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    settings = mergeSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch {
    settings = defaultSettings();
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

function applyMainSettings() {
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  globalShortcut.unregisterAll();
  if (settings.hotkey && settings.hotkey !== 'None') {
    try {
      globalShortcut.register(settings.hotkey, toggleWindow);
    } catch (error) {
      console.error('Failed to register hotkey:', settings.hotkey, error);
    }
  }
}

// Returns { ok: true, data } on success, or { ok: false, kind, message } on failure.
async function runGH(command, args) {
  try {
    const { stdout } = await execFilePromise(command, args, { env: ghEnv });
    // mark-read style endpoints return 205 with an empty body — treat as success/no data.
    return { ok: true, data: stdout && stdout.trim() ? JSON.parse(stdout) : null };
  } catch (error) {
    const kind = classifyGhFailure({
      code: error.code,
      stderr: `${error.stderr || ''}\n${error.message || ''}`,
    });
    console.error(`gh command failed (${kind}):`, error.message);
    return { ok: false, kind, message: String(error.stderr || error.message || '') };
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 420,
    height: 550,
    show: false,
    frame: false,
    fullscreenable: false,
    resizable: false,
    transparent: true,
    vibrancy: 'popover', // 'menu' or 'popover' or 'hud'
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    window.loadURL('http://localhost:5173');
  } else {
    window.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Hide the window when it loses focus
  window.on('blur', () => {
    if (!window.webContents.isDevToolsOpened()) {
      window.hide();
    }
  });
}

const toggleWindow = () => {
  if (window.isVisible()) {
    window.hide();
  } else {
    showWindow();
  }
}

const showWindow = () => {
  const position = getWindowPosition();
  window.setPosition(position.x, position.y, false);
  window.show();
  window.focus();
}

const getWindowPosition = () => {
  const windowBounds = window.getBounds();
  const trayBounds = tray.getBounds();
  
  // Center window horizontally below the tray icon
  const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
  
  // Position window 4 pixels vertically below the tray icon
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  
  return {x: x, y: y};
}

app.whenReady().then(() => {
  loadSettings();

  const iconPath = path.join(__dirname, 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('Git Menu');

  tray.on('right-click', toggleWindow);
  tray.on('double-click', toggleWindow);
  tray.on('click', function (event) {
    toggleWindow();
  });

  createWindow();
  applyMainSettings();

  app.dock.hide(); // Hide from the dock as it's a menu bar app
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC handlers
const prQuery = (searchQuery) => `
query {
  search(query: "${searchQuery}", type: ISSUE, first: 30) {
    nodes {
      ... on PullRequest {
        title
        number
        url
        isDraft
        repository { nameWithOwner }
        createdAt
        author { login avatarUrl }
        additions
        deletions
        reviewDecision
        labels(first: 3) { nodes { name color } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

ipcMain.handle('get-my-prs', async () => {
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${prQuery("is:pr is:open author:@me")}`]);
  if (!res.ok) return res;
  // res.data = runGH's parsed JSON envelope; the inner .data is GraphQL's own root.
  return { ok: true, data: res.data?.data?.search?.nodes || [] };
});

ipcMain.handle('get-review-requests', async () => {
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${prQuery("is:pr is:open review-requested:@me")}`]);
  if (!res.ok) return res;
  return { ok: true, data: res.data?.data?.search?.nodes || [] };
});

ipcMain.handle('get-contributions', async () => {
  const contribQuery = `
  query {
    viewer {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              color
            }
          }
        }
      }
    }
  }`;
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${contribQuery}`]);
  if (!res.ok) return res;
  return { ok: true, data: res.data?.data?.viewer?.contributionsCollection?.contributionCalendar || null };
});

ipcMain.handle('get-contributed-repos', async () => {
  const q = `
  query {
    viewer {
      repositoriesContributedTo(first: 100, includeUserRepositories: true, contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW], orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes { nameWithOwner }
      }
    }
  }`;
  const res = await runGH('gh', ['api', 'graphql', '-f', `query=${q}`]);
  if (!res.ok) return res;
  return { ok: true, data: res.data?.data?.viewer?.repositoriesContributedTo?.nodes || [] };
});

ipcMain.handle('get-inbox', async () => {
  const res = await runGH('gh', ['api', 'notifications', '--paginate']);
  if (!res.ok) return res;
  const items = filterInbox(res.data).map(normalizeNotification);
  return { ok: true, data: items };
});

ipcMain.handle('mark-read', async (event, id) => {
  if (!id) return { ok: true };
  const res = await runGH('gh', ['api', '-X', 'PATCH', `notifications/threads/${id}`]);
  return res.ok ? { ok: true } : res;
});

ipcMain.handle('mark-all-read', async (event, ids) => {
  for (const id of ids || []) {
    await runGH('gh', ['api', '-X', 'PATCH', `notifications/threads/${id}`]);
  }
  return { ok: true };
});

ipcMain.handle('get-settings', () => settings);

ipcMain.handle('set-settings', (event, next) => {
  settings = mergeSettings(next);
  saveSettings();
  applyMainSettings();
  return settings;
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.on('hide-window', () => {
  if (window) window.hide();
});

ipcMain.on('update-tray-count', (event, count) => {
  if (tray) {
    if (count > 0) {
      tray.setTitle(count.toString());
    } else {
      tray.setTitle('');
    }
  }
});
