<template>
  <div class="auth-callback">
    <div class="spinner"></div>
    <p>Completing authentication...</p>
  </div>
</template>

<script>
import { onMounted } from 'vue';

export default {
  name: 'AuthCallback',
  setup() {
    onMounted(async () => {
      try {
        // Get the authorization code and state from the URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        if (error) {
          throw new Error(errorDescription || 'Authentication failed');
        }

        if (!code || !state) {
          throw new Error('Missing required parameters');
        }

        // Get the stored state and code verifier
        const storedState = localStorage.getItem('dropbox_auth_state');
        const codeVerifier = localStorage.getItem('dropbox_code_verifier');

        // Verify the state parameter
        if (state !== storedState) {
          throw new Error('Invalid state parameter');
        }

        // Exchange the authorization code for an access token
        const clientId = import.meta.env.VITE_DROPBOX_CLIENT_ID;
        const tokenResponse = await exchangeCodeForToken(clientId, codeVerifier, code);

        // Send the token back to the parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'dropbox-auth-success',
            access_token: tokenResponse.access_token,
            refresh_token: tokenResponse.refresh_token
          }, window.location.origin);
        }

        // Close the popup
        window.close();
      } catch (error) {
        console.error('Authentication error:', error);
        
        // Send error to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'dropbox-auth-error',
            error: error.message || 'Authentication failed'
          }, window.location.origin);
        }
        
        // Show error to user
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = `Error: ${error.message || 'Authentication failed'}`;
        document.querySelector('.auth-callback').appendChild(errorElement);
      }
    });

    // Function to exchange authorization code for access token
    async function exchangeCodeForToken(clientId, codeVerifier, code) {
      const params = new URLSearchParams();
      params.append('code', code);
      params.append('grant_type', 'authorization_code');
      params.append('client_id', clientId);
      params.append('code_verifier', codeVerifier);
      params.append('redirect_uri', window.location.origin + '/auth/dropbox/callback');
      
      const response = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error_description || 'Failed to exchange code for token');
      }
      
      return response.json();
    }

    return {};
  }
};
</script>

<style scoped>
.auth-callback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background-color: #f5f5f5;
  color: #333;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: #0078d4;
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  color: #d32f2f;
  background-color: #ffebee;
  padding: 10px 15px;
  border-radius: 4px;
  margin-top: 20px;
  max-width: 80%;
  text-align: center;
}
</style>
