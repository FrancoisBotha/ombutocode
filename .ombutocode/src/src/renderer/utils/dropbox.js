import { Dropbox } from 'dropbox';

// Generate a secure random string for PKCE
function generatePKCEVerifier(length = 43) {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').substring(0, length);
}

// Base64 URL encode a string
function base64URLEncode(buffer) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Generate a code challenge for PKCE
async function generatePKCECodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(hashBuffer);
}

// Helper function to open URL in default browser
// Helper function to open URL in default browser
async function openExternalUrl(url) {
  console.log('Attempting to open URL:', url);
  
  try {
    // Try using the exposed electron shell API first
    if (window.electron?.shell?.openExternal) {
      console.log('Using electron.shell.openExternal');
      await window.electron.shell.openExternal(url);
      return;
    }
    
    // Fall back to require if available
    if (window.require) {
      console.log('Using require(\'electron\').shell.openExternal');
      const { shell } = window.require('electron');
      await shell.openExternal(url);
      return;
    }
    
    // Last resort: window.open
    console.warn('Falling back to window.open');
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('Error opening URL:', error);
    throw new Error(`Failed to open URL: ${error.message}`);
  }
}

// Exchange authorization code for access token
async function exchangeCodeForToken(clientId, codeVerifier, code) {
  const params = new URLSearchParams();
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('client_id', clientId);
  params.append('code_verifier', codeVerifier);
  // Use the same redirect_uri that's registered in Dropbox App Console
  params.append('redirect_uri', 'http://localhost:31031/auth/dropbox/callback');
  
  try {
    const response = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Token exchange error:', error);
      throw new Error(error.error_description || 'Failed to exchange code for token');
    }
    
    return response.json();
  } catch (error) {
    console.error('Error in exchangeCodeForToken:', error);
    throw error;
  }
}

// Initialize Dropbox client
const initDropbox = (accessToken) => {
  return new Dropbox({
    accessToken,
    fetch: window.fetch.bind(window)
  });
};

/**
 * Dropbox API wrapper with authentication and file operations
 */
export const useDropbox = () => {
  // Check if user is authenticated with Dropbox
  const isAuthenticated = async () => {
    const token = localStorage.getItem('dropbox_access_token');
    console.log('Checking authentication status, token exists:', !!token);
    
    if (!token) return false;
    
    try {
      // Try to use the token to make an API call
      const client = initDropbox(token);
      if (!client) {
        console.log('Failed to initialize Dropbox client');
        return false;
      }
      
      // Make a lightweight API call to verify the token
      await client.usersGetCurrentAccount();
      console.log('Dropbox token is valid');
      return true;
    } catch (error) {
      console.log('Dropbox token is invalid:', error.message);
      // Clean up invalid token
      if (error?.status === 401) {
        localStorage.removeItem('dropbox_access_token');
        localStorage.removeItem('dropbox_refresh_token');
      }
      return false;
    }
  };

  // Get the current access token
  const getAccessToken = () => {
    return localStorage.getItem('dropbox_access_token');
  };

  // Create a Dropbox client instance
  const getClient = () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error('No Dropbox access token found');
    }
    return initDropbox(accessToken);
  };

  // Initiate the Dropbox OAuth2 flow with PKCE
  const authenticate = () => {
    return new Promise(async (resolve, reject) => {
      try {
        const clientId = import.meta.env.VITE_DROPBOX_CLIENT_ID;
        if (!clientId || clientId === 'your_app_key_here') {
          throw new Error('Dropbox client ID is not properly configured. Please check your .env file.');
        }

        // Generate PKCE verifier and code challenge
        const codeVerifier = generatePKCEVerifier(43);
        const codeChallenge = await generatePKCECodeChallenge(codeVerifier);
        const state = Math.random().toString(36).substring(2, 15);
        
        // Store the verifier and state in localStorage
        localStorage.setItem('dropbox_code_verifier', codeVerifier);
        localStorage.setItem('dropbox_auth_state', state);

        // Build the authorization URL
        const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', clientId);
        // Use the exact redirect URI registered in Dropbox App Console
        authUrl.searchParams.append('redirect_uri', 'http://localhost:31031/auth/dropbox/callback');
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('scope', 'account_info.read files.content.write files.content.read');
        authUrl.searchParams.append('token_access_type', 'offline');
        authUrl.searchParams.append('disable_signup', 'true');
        
        console.log('Using auth URL:', authUrl.toString());

        // Set up a timeout for the auth process
        const authTimeout = setTimeout(() => {
          cleanup();
          reject(new Error('Authentication timed out after 5 minutes'));
        }, 5 * 60 * 1000); // 5 minutes timeout

        // Handle the OAuth callback from the main process
        const handleAuthCallback = async (event, { code, state: responseState, error: oauthError } = {}) => {
          console.log('=== DROPBOX AUTH CALLBACK TRIGGERED ===');
          console.log('Event:', event?.type || 'No event type');
          console.log('Code received:', code ? 'Yes' : 'No');
          console.log('State received:', responseState || 'None');
          
          // Handle OAuth errors
          if (oauthError) {
            console.error('OAuth error received:', oauthError);
            cleanup();
            reject(new Error(`OAuth error: ${oauthError}`));
            return;
          }
          console.log('=== DROPBOX AUTH CALLBACK HANDLER ===');
          console.log('Event type:', event?.type || 'No event type');
          console.log('Received code:', code ? 'Yes' : 'No');
          console.log('Received state:', responseState || 'None');
          
          try {
            const storedState = localStorage.getItem('dropbox_auth_state');
            const codeVerifier = localStorage.getItem('dropbox_code_verifier');
            
            console.log('Stored state:', storedState || 'None');
            console.log('Code verifier:', codeVerifier ? 'Found' : 'Not found');

            // Verify the state parameter
            if (responseState !== storedState) {
              const error = new Error('Invalid state parameter');
              console.error('State verification failed:', {
                received: responseState,
                expected: storedState,
                match: responseState === storedState
              });
              throw error;
            }

            if (!code) {
              const error = new Error('No authorization code received');
              console.error('No authorization code in callback');
              throw error;
            }

            console.log('Initiating token exchange with Dropbox...');
            const tokenResponse = await exchangeCodeForToken(clientId, codeVerifier, code);
            
            if (!tokenResponse?.access_token) {
              const error = new Error('No access token in response');
              console.error('Token exchange failed:', tokenResponse);
              throw error;
            }
            
            console.log('Token exchange successful, storing tokens...');
            
            try {
              // Store the access token
              localStorage.setItem('dropbox_access_token', tokenResponse.access_token);
              console.log('Access token stored in localStorage');
              
              if (tokenResponse.refresh_token) {
                localStorage.setItem('dropbox_refresh_token', tokenResponse.refresh_token);
                console.log('Refresh token stored in localStorage');
              }
              
              // Verify token was actually stored
              const storedToken = localStorage.getItem('dropbox_access_token');
              console.log('Verification - Stored token exists:', !!storedToken);
              console.log('Token length:', storedToken?.length || 0);
            } catch (storageError) {
              console.error('Error storing tokens in localStorage:', storageError);
              throw new Error('Failed to store authentication tokens');
            }
            
            console.log('Preparing authentication result...');
            clearTimeout(authTimeout);
            
            const result = {
              success: true, // Add success flag
              accessToken: tokenResponse.access_token,
              refreshToken: tokenResponse.refresh_token,
              expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
              dropboxClient: initDropbox(tokenResponse.access_token)
            };
            
            // Verify client initialization
            try {
              console.log('Verifying Dropbox client...');
              const client = result.dropboxClient;
              const accountInfo = await client.usersGetCurrentAccount();
              console.log('Successfully connected to Dropbox as:', accountInfo.result.name.display_name);
              
              console.log('Authentication flow completed successfully');
              console.log('=== END DROPBOX AUTH CALLBACK HANDLER ===');
              
              // Clean up only after successful verification
              cleanup();
              resolve(result);
              
            } catch (verifyError) {
              console.error('Failed to verify Dropbox client:', verifyError);
              cleanup();
              reject(new Error('Failed to verify Dropbox connection'));
            }
          } catch (error) {
            clearTimeout(authTimeout);
            cleanup();
            reject(error);
          }
        };

        console.log('Setting up Dropbox auth message listener...');
        
        // Cleanup function
        let isCleanedUp = false;
        const cleanup = () => {
          if (isCleanedUp) {
            console.log('Cleanup already performed, skipping...');
            return;
          }
          isCleanedUp = true;
          console.log('Starting cleanup...');
          console.log('Cleaning up Dropbox auth listeners...');
          
          // Remove IPC listeners
          if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.removeAllListeners('dropbox-auth-callback');
          }
          
          // Remove window message listener
          window.removeEventListener('message', handleWindowMessage);
          
          // Clean up stored auth state
          localStorage.removeItem('dropbox_code_verifier');
          localStorage.removeItem('dropbox_auth_state');
          
          // Clean up any other listeners
          if (cleanupAuthListener) {
            cleanupAuthListener();
          }
          
          console.log('Dropbox auth cleanup complete');
          
          // Log the final state of localStorage for debugging
          console.log('Final localStorage state:', {
            hasAccessToken: !!localStorage.getItem('dropbox_access_token'),
            hasRefreshToken: !!localStorage.getItem('dropbox_refresh_token')
          });
        };
        
        // Handle window message events for fallback authentication
        const handleWindowMessage = (event) => {
          console.log('Received window message:', event);
          
          // Only process messages from the expected origin
          if (event.origin !== 'https://www.dropbox.com') {
            console.log('Ignoring message from unexpected origin:', event.origin);
            return;
          }
          
          try {
            const data = event.data;
            console.log('Processing Dropbox auth message:', data);
            
            if (data && (data.type === 'dropbox-auth-callback' || data.code)) {
              handleAuthCallback(event, data);
            }
          } catch (error) {
            console.error('Error processing window message:', error);
          }
        };
        
        // Set up the auth callback handler
        const setupAuthHandlers = () => {
          console.log('Initializing Dropbox auth handlers...');
          
          // Debug what's available in the window.electron object
          console.log('Available electron APIs:', {
            hasElectron: !!window.electron,
            hasDropbox: !!window.electron?.dropbox,
            hasOnAuthCallback: !!window.electron?.dropbox?.onAuthCallback,
            hasIpcRenderer: !!window.electron?.ipcRenderer,
            hasOpenExternal: !!window.electron?.shell?.openExternal
          });
          
          // Try to use the exposed dropbox object first
          if (window.electron?.dropbox?.onAuthCallback) {
            console.log('Using enhanced Dropbox auth handler');
            try {
              const cleanup = window.electron.dropbox.onAuthCallback((data) => {
                console.log('Received Dropbox auth callback via preload handler', data);
                handleAuthCallback({ type: 'ipc-message' }, data);
              });
              
              // Return cleanup function
              return () => {
                console.log('Cleaning up enhanced auth handler');
                if (typeof cleanup === 'function') {
                  cleanup();
                }
              };
            } catch (error) {
              console.error('Error setting up enhanced auth handler:', error);
              // Fall through to next method
            }
          }
          
          // Fall back to direct IPC
          if (window.electron?.ipcRenderer?.on) {
            console.log('Using direct IPC for Dropbox auth');
            try {
              const handler = (event, data) => {
                console.log('Received Dropbox auth callback via direct IPC', data);
                if (data && (data.code || data.state)) {
                  handleAuthCallback(event, data);
                }
              };
              
              window.electron.ipcRenderer.on('dropbox-auth-callback', handler);
              
              // Return cleanup function
              return () => {
                console.log('Cleaning up IPC handler');
                try {
                  window.electron.ipcRenderer.removeListener('dropbox-auth-callback', handler);
                } catch (e) {
                  console.error('Error cleaning up IPC handler:', e);
                }
              };
            } catch (error) {
              console.error('Error setting up IPC handler:', error);
              // Fall through to next method
            }
          }
          
          // Fall back to window messages as last resort
          console.warn('Electron IPC not available, using fallback authentication');
          try {
            window.addEventListener('message', handleWindowMessage);
            
            // Return cleanup function
            return () => {
              console.log('Cleaning up window message handler');
              window.removeEventListener('message', handleWindowMessage);
            };
          } catch (error) {
            console.error('Error setting up window message handler:', error);
            throw new Error('No available authentication methods could be initialized');
          }
        };
        
        // Initialize the auth handlers
        const cleanupAuthListener = setupAuthHandlers();

        // Open the authorization URL in the default browser
        await openExternalUrl(authUrl.toString());

      } catch (error) {
        console.error('Authentication error:', error);
        reject(error);
      }
    });
  };

  // Disconnect from Dropbox
  const disconnect = async () => {
    const token = getAccessToken();

    // Clear local tokens regardless of API call success
    localStorage.removeItem('dropbox_access_token');
    localStorage.removeItem('dropbox_refresh_token');
    localStorage.removeItem('dropbox_auth_state');
    localStorage.removeItem('dropbox_code_verifier');

    if (token) {
      try {
        const dbx = initDropbox(token);
        await dbx.authTokenRevoke();
        console.log('Dropbox token revoked successfully.');
      } catch (error) {
        console.error('Failed to revoke Dropbox token, but cleared locally anyway.', error);
      }
    }

    return { success: true };
  };

  const sanitizeFolder = (s) => {
    if (!s) return "";                     // no folder
    const trimmed = s.trim().replace(/^\/+|\/+$/g, ""); // strip leading/trailing slashes
    return trimmed ? `/${trimmed}` : "";   // ensure leading slash only if non-empty
  };
  
  const getErrorSummary = (e) =>
    e?.error?.error_summary ||
    e?.error?.error?.error_summary ||
    e?.message ||
    String(e);
  
  const ensureFolder = async (dbx, folderPath) => {
    if (!folderPath || folderPath === "/") return;    // don't create root / empty
    try {
      await dbx.filesGetMetadata({ path: folderPath });
    } catch (e) {
      const summary = getErrorSummary(e);
      if (summary.includes("path/not_found/")) {
        await dbx.filesCreateFolderV2({ path: folderPath, autorename: false });
      } else {
        throw e;
      }
    }
  };
  
  const backupData = async (data, filename = "ombutocode-backup.json", subfolder = "") => {
    const dbx = getClient();
    
    try {
      // Fetch archive.db binary data via IPC (ARCH_SQL-009)
      let archiveDbData = null;
      try {
        const archiveResult = await window.electron.ipcRenderer.invoke('archive:backupDb');
        if (archiveResult.success && archiveResult.exists) {
          archiveDbData = archiveResult.data;
          console.log('[Dropbox Backup] Including archive.db, size:', archiveResult.size);
        } else if (archiveResult.success && !archiveResult.exists) {
          console.log('[Dropbox Backup] archive.db does not exist, skipping');
        } else {
          console.warn('[Dropbox Backup] Failed to read archive.db:', archiveResult.error);
        }
      } catch (archiveError) {
        console.warn('[Dropbox Backup] Error reading archive.db:', archiveError);
      }
      
      // Prepare the backup package with both JSON data and archive.db
      const backupPackage = {
        ...data,
        _archiveDb: archiveDbData
      };
      
      // Prepare the data first to catch any JSON serialization issues
      const dataString = JSON.stringify(backupPackage, null, 2);
      const bytes = new TextEncoder().encode(dataString);
      
      // For App Folder apps, we don't need to specify the full path
      const filePath = `/${filename.endsWith('.json') ? filename : `${filename}.json`}`;
      
      console.log('Attempting to upload to Dropbox App Folder:', {
        filePath,
        dataSize: bytes.length,
        hasArchiveDb: !!archiveDbData,
        first100Chars: dataString.substring(0, 100) + (dataString.length > 100 ? '...' : '')
      });
      
      const result = await dbx.filesUpload({
        path: filePath,
        contents: bytes,
        mode: { ".tag": "overwrite" },
        mute: true
      });
      
      console.log('Upload successful:', result);
      return { 
        success: true, 
        path: result.result.path_display || filePath,
        hasArchiveDb: !!archiveDbData
      };
      
    } catch (e) {
      console.error('Dropbox upload failed:', {
        name: e.name,
        status: e.status,
        error: e.error,
        message: e.message,
        stack: e.stack,
        request: e.request,
        response: e.response
      });
      
      return { 
        success: false, 
        error: getErrorSummary(e),
        details: e.error || e,
        status: e.status,
        request: e.request,
        response: e.response
      };
    }
  };

  // List all backups from Dropbox (App Folder root)
  const listBackups = async () => {
    const dbx = getClient();
    try {
      console.log('[Dropbox] listBackups: listing App Folder root');
      // For App Folder apps, list root with empty path
      const response = await dbx.filesListFolder({ path: '' });
      console.log('[Dropbox] listBackups: raw entries:', (response?.result?.entries || []).map(e => ({ tag: e['.tag'], id: e.id, name: e.name, path: e.path_display })));
      const backups = response.result.entries
        .filter(entry => entry['.tag'] === 'file' && entry.name.toLowerCase().endsWith('.json'))
        .map(file => ({
          id: file.id,
          name: file.name,
          path: file.path_display || `/${file.name}`,
          modified: file.server_modified,
          size: file.size
        }))
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));
      console.log('[Dropbox] listBackups: found JSON backups:', backups);
      return { success: true, backups };
    } catch (error) {
      console.error('[Dropbox] listBackups error:', {
        name: error?.name,
        status: error?.status,
        message: error?.message,
        error: error?.error,
        summary: getErrorSummary(error)
      });
      return { success: false, error: getErrorSummary(error) };
    }
  };

  // Restore data from Dropbox
  const restoreData = async (filePath) => {
    const dbx = getClient();
    
    try {
      console.log('[Dropbox] restoreData called with:', filePath);
      // If caller passes an id (id:xxx), Dropbox accepts it directly.
      let pathArg = filePath;
      if (typeof pathArg === 'string') {
        if (!pathArg.startsWith('id:') && !pathArg.startsWith('/')) {
          pathArg = `/${pathArg}`;
        }
      }
      console.log('[Dropbox] restoreData: using path argument:', pathArg);
      const response = await dbx.filesDownload({ path: pathArg });
      // @ts-ignore - The response has a fileBlob property
      const fileContents = await response.result.fileBlob.text();
      console.log('[Dropbox] restoreData: downloaded bytes:', fileContents?.length || 0);
      
      const parsedData = JSON.parse(fileContents);
      
      // Restore archive.db if present in backup (ARCH_SQL-009)
      if (parsedData._archiveDb && typeof parsedData._archiveDb === 'string') {
        try {
          console.log('[Dropbox Restore] Found archive.db in backup, restoring...');
          const restoreResult = await window.electron.ipcRenderer.invoke('archive:restoreDb', { 
            data: parsedData._archiveDb 
          });
          if (restoreResult.success) {
            console.log('[Dropbox Restore] archive.db restored successfully, size:', restoreResult.size);
          } else {
            console.warn('[Dropbox Restore] Failed to restore archive.db:', restoreResult.error);
          }
        } catch (archiveError) {
          console.warn('[Dropbox Restore] Error restoring archive.db:', archiveError);
        }
        
        // Remove the archive.db data from the returned data object
        delete parsedData._archiveDb;
      } else {
        console.log('[Dropbox Restore] No archive.db found in backup (older backup or empty archive)');
      }
      
      return { success: true, data: parsedData };
    } catch (error) {
      console.error('[Dropbox] restoreData error:', {
        name: error?.name,
        status: error?.status,
        message: error?.message,
        error: error?.error,
        summary: getErrorSummary(error)
      });
      return { success: false, error: getErrorSummary(error) };
    }
  };

  return {
    isAuthenticated,
    getAccessToken,
    getClient,
    authenticate,
    disconnect,
    backupData,
    listBackups,
    restoreData
  };
};

export default useDropbox;
