<template>
  <div class="dropbox-callback">
    <div v-if="isLoading" class="loading">
      <p>Connecting to Dropbox...</p>
      <div class="spinner"></div>
    </div>
    <div v-else-if="error" class="error">
      <p>Error: {{ error }}</p>
      <button @click="closeWindow" class="btn">Close</button>
    </div>
    <div v-else class="success">
      <p>Successfully connected to Dropbox!</p>
      <p>You can close this window and return to the app.</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DropboxCallback',
  data() {
    return {
      isLoading: true,
      error: null
    };
  },
  mounted() {
    this.handleCallback();
  },
  methods: {
    handleCallback() {
      try {
        // Extract the access token from the URL hash
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        
        const accessToken = params.get('access_token');
        const tokenType = params.get('token_type');
        const state = params.get('state');
        
        // Validate the response
        if (!accessToken || !tokenType || !state) {
          throw new Error('Invalid OAuth response');
        }
        
        // Send the token back to the parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'dropbox-auth',
            access_token: accessToken,
            token_type: tokenType,
            state: state
          }, window.location.origin);
          
          // Close the window after a short delay
          setTimeout(() => {
            window.close();
          }, 1000);
          
          this.isLoading = false;
        } else {
          throw new Error('No parent window found');
        }
      } catch (err) {
        console.error('Dropbox callback error:', err);
        this.error = err.message || 'Failed to authenticate with Dropbox';
        this.isLoading = false;
      }
    },
    closeWindow() {
      window.close();
    }
  }
};
</script>

<style scoped>
.dropbox-callback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  text-align: center;
  padding: 2rem;
  background-color: #f8f9fa;
}

.loading p,
.success p {
  font-size: 1.2rem;
  margin-bottom: 1.5rem;
  color: #2c3e50;
}

.error p {
  font-size: 1.2rem;
  margin-bottom: 1.5rem;
  color: #e74c3c;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #0061ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.btn {
  padding: 0.5rem 1.5rem;
  background-color: #0061ff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn:hover {
  background-color: #0050d1;
}
</style>
