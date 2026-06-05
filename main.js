import { app, BrowserWindow, Tray, ipcMain, shell, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import util from 'util';
import { classifyGhFailure } from './lib/gh-errors.js';

const execFilePromise = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;
let window = null;

const isDev = process.env.NODE_ENV === 'development';

// Setup environment to ensure gh can be found when packaged
const ghEnv = { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };

// Returns { ok: true, data } on success, or { ok: false, kind, message } on failure.
async function runGH(command, args) {
  try {
    const { stdout } = await execFilePromise(command, args, { env: ghEnv });
    return { ok: true, data: JSON.parse(stdout) };
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

  app.dock.hide(); // Hide from the dock as it's a menu bar app
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('quit-app', () => {
  app.quit();
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
