const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getMyPRs: () => ipcRenderer.invoke('get-my-prs'),
  getReviewRequests: () => ipcRenderer.invoke('get-review-requests'),
  getContributions: () => ipcRenderer.invoke('get-contributions'),
  getContributedRepos: () => ipcRenderer.invoke('get-contributed-repos'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  updateTrayCount: (count) => ipcRenderer.send('update-tray-count', count),
  quitApp: () => ipcRenderer.send('quit-app')
});
