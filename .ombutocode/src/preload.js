const { contextBridge, ipcRenderer } = require('electron');
const { shell } = require('electron');
const { platform } = require('os');

// Log that preload script is running
console.log('[Preload] Preload script loaded');

// Whitelist of valid channels for both sending and receiving
const validChannels = [
  'toMain',
  'fromMain',
  'dropbox-auth-callback',
  'dropbox-connect',
  'dropbox-disconnect',
  'dropbox-auth-error',
  'app:getPath',
  'app:getProjectRoot',
  'app:getBuildInfo',
  'app:setTitleBranding',
  'app:getTitleBranding',
  'app:titleBrandingChanged',
  'backlog:read',
  'backlog:updateStatus',
  'backlog:rejectReviewTicket',
  'backlog:updateAssignee',
  'backlog:pickupByAgent',
  'backlog:createAdHocFromPrompt',
  'backlog:deleteTicket',
  'backlog:updateFields',
  'agent:startKimiForTicket',
  'agent:startCodexForTicket',
  'agent:startClaudeForTicket',
  'agent:getRunStatus',
  'agent:readRunLogs',
  'agent:checkProcessAlive',
  'agent:cancelRunningTicket',
  'archive:read',
  'archive:moveTicket',
  'archive:search',
  'archive:getDistinctEpicRefs',
  'archive:backupDb',
  'archive:restoreDb',
  'archive:dbExists',
  'db:export',
  'db:import',
  'prd:read',
  'epics:read',
  'epics:updateStatus',
  'epics:start',
  'epics:checkReadiness',
  'epics:evaluate',
  'epics:evalStatus',
  'epics:evalComplete',
  'agents:read',
  'agents:write',
  'agents:state',
  'scheduler:start',
  'scheduler:stop',
  'scheduler:status',
  'automation:active-runs',
  'automation:eval-queue',
  'automation:agent-status',
  'automation:unpause-agent',
  'scheduler:deleteQueueTicket',
  'settings:read',
  'settings:write',
  'requests:read',
  'requests:create',
  'requests:update',
  'requests:delete',
  'requests:linkToFeature',
  'requests:markDone',
  'requests:search',
  'requests:markDone',
  'logs:read',
  'logs:search',
  'logs:getDistinctEventTypes',
  'logs:getDistinctTicketIds',
  'app:confirmClose',
  'app:closeConfirmed',
  'app:closeCancelled',
  'workspace:gitStatus',
  'workspace:gitLog',
  'workspace:gitDiff',
  'workspace:gitCommit',
  'workspace:gitPush',
  'workspace:spawnShell',
  'workspace:writeShell',
  'workspace:resizeShell',
  'workspace:killShell',
  'workspace:shellData',
  'workspace:shellExit',
  'agent:testConnectivity',
  'agent:spawnInteractive',
  'agent:getStartupResults',
  'app:noAgentsConnected',
  'filetree:scan',
  'filetree:createFolder',
  'filetree:deleteFolder',
  'filetree:renameFile',
  'filetree:readFile',
  'filetree:writeFile',
  'filetree:deleteFile',
  'filetree:scanMockups',
  'filetree:readImage',
  'filetree:scanUseCaseDiagrams',
  'filetree:scanUseCases',
  'filetree:scanAllFiles',
  'filetree:scanClassDiagrams',
  'version:log',
  'version:fileAtCommit',
  'excel:exportRequirements',
  'excel:importRequirements',
  'tree:build',
  'tree:ancestors',
  'tree:descendants',
  'tree:children',
  'tree:breadcrumb',
  'tree:coverage',
  'tree:componentSummary',
  'artifact:list',
  'artifact:get',
  'artifact:create',
  'artifact:update',
  'artifact:archive',
  'artifact:nextId',
  'artifact:rebuildIndex',
  'watcher:fileChanged'
];

// Expose a safe subset of Electron APIs to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // IPC communication with validation
  ipcRenderer: {
    send: (channel, ...args) => {
      if (validChannels.includes(channel)) {
        console.log(`[Preload] Sending IPC message to ${channel}`, args);
        ipcRenderer.send(channel, ...args);
      } else {
        console.warn(`Attempted to send to invalid channel: ${channel}`);
      }
    },
    
    on: (channel, listener) => {
      if (!validChannels.includes(channel)) {
        console.warn(`Attempted to listen to invalid channel: ${channel}`);
        return () => {}; // Return empty cleanup function
      }
      
      console.log(`[Preload] Adding listener for ${channel}`);
      
      // Create a wrapped listener for better error handling
      const wrappedListener = (event, ...args) => {
        try {
          console.log(`[Preload] Received message on ${channel}`, { args });
          // Strip event as it includes `sender` which is a security risk
          const result = listener(...args);
          
          // Handle async listeners
          if (result && typeof result.catch === 'function') {
            result.catch(error => {
              console.error(`[Preload] Error in ${channel} handler:`, error);
              // Forward errors to renderer
              if (channel === 'dropbox-auth-callback') {
                ipcRenderer.send('dropbox-auth-error', {
                  error: error.message || 'Unknown error in auth callback',
                  stack: error.stack
                });
              }
            });
          }
          return result;
        } catch (error) {
          console.error(`[Preload] Error in ${channel} handler:`, error);
          // Forward errors to renderer
          if (channel === 'dropbox-auth-callback') {
            ipcRenderer.send('dropbox-auth-error', {
              error: error.message || 'Unknown error in auth callback',
              stack: error.stack
            });
          }
        }
      };
      
      ipcRenderer.on(channel, wrappedListener);
      
      // Return cleanup function
      return () => {
        console.log(`[Preload] Removing listener for ${channel}`);
        ipcRenderer.removeListener(channel, wrappedListener);
      };
    },
    
    removeAllListeners: (channel) => {
      if (validChannels.includes(channel)) {
        console.log(`[Preload] Removing all listeners for ${channel}`);
        ipcRenderer.removeAllListeners(channel);
      } else {
        console.warn(`Attempted to remove listeners from invalid channel: ${channel}`);
      }
    },
    
    invoke: (channel, ...args) => {
      if (validChannels.includes(channel)) {
        console.log(`[Preload] Invoking IPC handler ${channel}`, args);
        return ipcRenderer.invoke(channel, ...args);
      }
      console.warn(`Attempted to invoke invalid channel: ${channel}`);
      return Promise.reject(new Error(`Invalid channel: ${channel}`));
    }
  },
  
  // Shell API for opening external URLs
  shell: {
    openExternal: async (url) => {
      console.log(`[Preload] Opening external URL: ${url}`);
      try {
        await shell.openExternal(url);
        return true;
      } catch (error) {
        console.error('[Preload] Error opening URL:', error);
        throw error;
      }
    }
  },
  
  // Dropbox specific handlers
  dropbox: {
    onAuthCallback: (callback) => {
      console.log('[Preload] Setting up Dropbox auth callback handler');
      const handler = (event, ...args) => {
        console.log('[Preload] Received Dropbox auth callback', args);
        callback(...args);
      };
      
      ipcRenderer.on('dropbox-auth-callback', handler);
      
      // Return cleanup function
      return () => {
        console.log('[Preload] Cleaning up Dropbox auth handler');
        ipcRenderer.removeListener('dropbox-auth-callback', handler);
      };
    }
  },
  
  // Platform and path utilities
  platform: platform(),
  getPath: (pathName) => ipcRenderer.invoke('app:getPath', pathName),
  
  // Title bar branding
  setTitleBranding: (title) => ipcRenderer.invoke('app:setTitleBranding', { title }),
  getTitleBranding: () => ipcRenderer.invoke('app:getTitleBranding'),
  onTitleBrandingChanged: (callback) => {
    const handler = (_, args) => callback(args);
    ipcRenderer.on('app:titleBrandingChanged', handler);
    return () => ipcRenderer.removeListener('app:titleBrandingChanged', handler);
  }
});

// Expose window control API (used by custom titlebar)
contextBridge.exposeInMainWorld('api', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    toggleMaximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  }
});
