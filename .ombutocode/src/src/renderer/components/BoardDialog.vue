<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal">
      <h3>Create New Board</h3>
      <div class="form-group">
        <label for="board-name">Board Name</label>
        <input
          id="board-name"
          ref="nameInput"
          v-model="boardName"
          type="text"
          class="form-control"
          placeholder="Enter board name"
          @keyup.enter="createBoard"
        >
        <div v-if="error" class="error-message">{{ error }}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="close">
          Cancel
        </button>
        <button class="btn btn-primary" @click="createBoard">
          Create
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BoardDialog',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:show', 'create'],
  data() {
    return {
      boardName: '',
      error: ''
    };
  },
  watch: {
    show(newVal) {
      if (newVal) {
        this.boardName = '';
        this.error = '';
        this.$nextTick(() => {
          this.$refs.nameInput?.focus();
        });
      }
    }
  },
  methods: {
    validate() {
      if (!this.boardName.trim()) {
        this.error = 'Board name is required';
        return false;
      }
      this.error = '';
      return true;
    },
    createBoard() {
      if (this.validate()) {
        this.$emit('create', this.boardName.trim());
        this.close();
      }
    },
    close() {
      this.$emit('update:show', false);
    }
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #333;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #444;
}

.form-control {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.error-message {
  color: #e74c3c;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary {
  background-color: #4a90e2;
  color: white;
}

.btn-primary:hover {
  background-color: #357abd;
}

.btn-secondary {
  background-color: #f0f0f0;
  color: #333;
}

.btn-secondary:hover {
  background-color: #e0e0e0;
}
</style>
