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
async function openExternalUrl(url) {
  if (window.electron?.shell?.openExternal) {
    return window.electron.shell.openExternal(url);
  } else if (window.require) {
    const { shell } = window.require('electron');
    return shell.openExternal(url);
  }
  window.open(url, '_blank');
}

// Exchange authorization code for access token
async function exchangeCodeForToken(clientId, codeVerifier, code) {
  const params = new URLSearchParams();
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('client_id', clientId);
  params.append('code_verifier', codeVerifier);
  params.append('redirect_uri', 'ombutocode://auth/dropbox/callback');
  
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
const useDropbox = () => {
  // Check if user is authenticated with Dropbox
  const isAuthenticated = () => {
    return !!localStorage.getItem('dropbox_access_token');
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
      // Cleanup function
      const cleanup = () => {
        if (window.electron?.ipcRenderer) {
          window.electron.ipcRenderer.removeAllListeners('dropbox-auth-callback');
        }
        if (handleWindowMessage) {
          window.removeEventListener('message', handleWindowMessage);
        }
        localStorage.removeItem('dropbox_code_verifier');
        localStorage.removeItem('dropbox_auth_state');
      };

      // Handle window message event for non-Electron environments
      const handleWindowMessage = (event) => {
        if (event.data && event.data.type === 'dropbox-auth-callback') {
          handleAuthCallback(event, event.data);
        }
      };

      // Handle the OAuth callback from the main process
      const handleAuthCallback = async (event, { code, state: responseState } = {}) => {
        try {
          const storedState = localStorage.getItem('dropbox_auth_state');
          const codeVerifier = localStorage.getItem('dropbox_code_verifier');

          // Verify the state parameter
          if (responseState !== storedState) {
            throw new Error('Invalid state parameter');
          }

          if (!code) {
            throw new Error('No authorization code received');
          }

          // Exchange the authorization code for an access token
          const tokenResponse = await exchangeCodeForToken(clientId, codeVerifier, code);
          
          // Store the access token
          localStorage.setItem('dropbox_access_token', tokenResponse.access_token);
          
          if (tokenResponse.refresh_token) {
            localStorage.setItem('dropbox_refresh_token', tokenResponse.refresh_token);
          }
          
          clearTimeout(authTimeout);
          cleanup();
          
          resolve({
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
            dropboxClient: initDropbox(tokenResponse.access_token)
          });
        } catch (error) {
          clearTimeout(authTimeout);
          cleanup();
          reject(error);
        }
      };

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
        const redirectUri = 'ombutocode://auth/dropbox/callback';
        const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('token_access_type', 'offline');
        authUrl.searchParams.append('disable_signup', 'true');

        // Set up a timeout for the auth process
        const authTimeout = setTimeout(() => {
          cleanup();
          reject(new Error('Authentication timed out after 5 minutes'));
        }, 5 * 60 * 1000); // 5 minutes timeout

        // Listen for the auth callback from the main process
        if (window.electron?.ipcRenderer) {
          window.electron.ipcRenderer.once('dropbox-auth-callback', handleAuthCallback);
        } else {
          console.warn('Electron IPC not available, using fallback authentication');
          window.addEventListener('message', handleWindowMessage);
        }

        // Open the authorization URL in the default browser
        await openExternalUrl(authUrl.toString());

      } catch (error) {
        console.error('Authentication error:', error);
        cleanup();
        reject(error);
      }
    });
  };

  // Disconnect from Dropbox
  const disconnect = () => {
    localStorage.removeItem('dropbox_access_token');
    localStorage.removeItem('dropbox_refresh_token');
    return Promise.resolve();
  };

  // Backup data to Dropbox
  const backupData = async (data, filename = 'ombutocode-backup.json') => {
    const dbx = getClient();
    const path = `/OmbutoCode/${filename}`;
    
    try {
      // Create the OmbutoCode folder if it doesn't exist
      try {
        await dbx.filesCreateFolderV2({ path: '/OmbutoCode' });
      } catch (error) {
        // Folder already exists, which is fine
        if (error.error?.error?.['.tag'] !== 'path/conflict/folder') {
          throw error;
        }
      }
      
      await dbx.filesUpload({
        path,
        contents: JSON.stringify(data, null, 2),
        mode: { '.tag': 'overwrite' },
        mute: true
      });
      
      return { success: true };
    } catch (error) {
      console.error('Dropbox backup error:', error);
      return { success: false, error: error.message };
    }
  };

  // List all backups from Dropbox
  const listBackups = async () => {
    const dbx = getClient();
    
    try {
      const response = await dbx.filesListFolder({ path: '/OmbutoCode' });
      const backups = response.result.entries
        .filter(entry => entry['.tag'] === 'file' && entry.name.endsWith('.json'))
        .map(file => ({
          name: file.name,
          path: file.path_display,
          modified: file.server_modified,
          size: file.size
        }))
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));
      
      return { success: true, backups };
    } catch (error) {
      console.error('Error listing Dropbox backups:', error);
      return { success: false, error: error.message };
    }
  };

  // Restore data from Dropbox
  const restoreData = async (filePath) => {
    const dbx = getClient();
    
    try {
      const response = await dbx.filesDownload({ path: filePath });
      // @ts-ignore - The response has a fileBlob property
      const fileContents = await response.result.fileBlob.text();
      return { success: true, data: JSON.parse(fileContents) };
    } catch (error) {
      console.error('Error restoring from Dropbox:', error);
      return { success: false, error: error.message };
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
