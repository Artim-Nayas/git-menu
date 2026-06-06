const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getMyPRs: () => ipcRenderer.invoke('get-my-prs'),
  getReviewRequests: () => ipcRenderer.invoke('get-review-requests'),
  getContributions: () => ipcRenderer.invoke('get-contributions'),
  getContributedRepos: () => ipcRenderer.invoke('get-contributed-repos'),
  getInbox: () => ipcRenderer.invoke('get-inbox'),
  markRead: (id) => ipcRenderer.invoke('mark-read', id),
  markAllRead: (ids) => ipcRenderer.invoke('mark-all-read', ids),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (next) => ipcRenderer.invoke('set-settings', next),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: (tag) => ipcRenderer.invoke('download-update', tag),
  getActionRuns: (repos) => ipcRenderer.invoke('get-action-runs', repos),
  getRunJobs: (repo, runId) => ipcRenderer.invoke('get-run-jobs', { repo, runId }),
  getPrChecks: (repo, number) => ipcRenderer.invoke('get-pr-checks', { repo, number }),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  updateTrayCount: (count) => ipcRenderer.send('update-tray-count', count),
  quitApp: () => ipcRenderer.send('quit-app'),
  hideWindow: () => ipcRenderer.send('hide-window')
});
