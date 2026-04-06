import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useBoardStore = defineStore('board', () => {
  // Initialize from localStorage or use default values
  const _boards = ref(JSON.parse(localStorage.getItem('kanban-boards') || '[]'));
  const _tasks = ref(JSON.parse(localStorage.getItem('kanban-tasks') || '{}'));
  
  // Create reactive references for boards and tasks
  const boards = computed({
    get: () => _boards.value || [],
    set: (value) => { _boards.value = value; }
  });
  
  const tasks = computed({
    get: () => _tasks.value || {},
    set: (value) => { _tasks.value = value; }
  });
  
  // Generate a simple ID
  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  // Save to localStorage whenever state changes
  function saveState() {
    try {
      localStorage.setItem('kanban-boards', JSON.stringify(_boards.value));
      localStorage.setItem('kanban-tasks', JSON.stringify(_tasks.value));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  // Board actions
  function addBoard(name) {
    try {
      const newBoard = {
        id: generateId(),
        name: name || 'New Board',
        createdAt: new Date().toISOString()
      };
      
      if (!boards.value) {
        boards.value = [];
      }
      
      boards.value.push(newBoard);
      
      if (!tasks.value) {
        tasks.value = {};
      }
      
      tasks.value[newBoard.id] = [];
      saveState();
      return newBoard;
    } catch (error) {
      console.error('Error adding board:', error);
      throw error;
    }
  }

  function updateBoard(updatedBoard) {
    try {
      if (!updatedBoard || !updatedBoard.id) return null;
      
      const index = boards.value.findIndex(b => b.id === updatedBoard.id);
      if (index !== -1) {
        boards.value[index] = {
          ...boards.value[index],
          ...updatedBoard,
          updatedAt: new Date().toISOString()
        };
        saveState();
        return boards.value[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating board:', error);
      throw error;
    }
  }

  function deleteBoard(boardId) {
    try {
      console.log('[deleteBoard] Attempting to delete board with ID:', boardId);
      console.log('[deleteBoard] Current boards before deletion:', JSON.parse(JSON.stringify(_boards.value)));
      
      if (!boardId) {
        console.warn('[deleteBoard] No board ID provided');
        return false;
      }

      if (_boards.value.length <= 1) {
        console.warn('[deleteBoard] Refusing to delete the last remaining board');
        return false;
      }
      
      const index = _boards.value.findIndex(b => b.id === boardId);
      console.log(`[deleteBoard] Found board at index: ${index}`);
      
      if (index !== -1) {
        console.log(`[deleteBoard] Removing board with ID: ${boardId}`);
        _boards.value.splice(index, 1);
        
        if (_tasks.value[boardId]) {
          console.log(`[deleteBoard] Removing tasks for board ID: ${boardId}`);
          delete _tasks.value[boardId];
        } else {
          console.log(`[deleteBoard] No tasks found for board ID: ${boardId}`);
        }
        
        console.log('[deleteBoard] Saving state...');
        saveState();
        console.log('[deleteBoard] State saved successfully');
        console.log('[deleteBoard] Boards after deletion:', JSON.parse(JSON.stringify(_boards.value)));
        return true;
      }
      
      console.warn(`[deleteBoard] Board with ID ${boardId} not found`);
      return false;
    } catch (error) {
      console.error('[deleteBoard] Error deleting board:', error);
      throw error;
    }
  }

  // Task actions
  function getTasks(boardId) {
    if (!boardId || !tasks.value) return [];
    return tasks.value[boardId] || [];
  }
  
  function addTask(task) {
    try {
      if (!task || !task.boardId) return null;
      
      if (!tasks.value[task.boardId]) {
        tasks.value[task.boardId] = [];
      }
      
      const newTask = {
        ...task,
        id: task.id || generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      tasks.value[task.boardId].push(newTask);
      saveState();
      return newTask;
    } catch (error) {
      console.error('Error adding task:', error);
      throw error;
    }
  }
  
  function updateTask(updatedTask) {
    try {
      if (!updatedTask || !updatedTask.boardId || !updatedTask.id) return null;
      
      const boardTasks = tasks.value[updatedTask.boardId] || [];
      const taskIndex = boardTasks.findIndex(t => t.id === updatedTask.id);
      
      if (taskIndex !== -1) {
        boardTasks[taskIndex] = {
          ...boardTasks[taskIndex],
          ...updatedTask,
          updatedAt: new Date().toISOString()
        };
        saveState();
        return boardTasks[taskIndex];
      }
      return null;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  function deleteTask(taskId) {
    try {
      if (!taskId) return false;
      
      for (const boardId in tasks.value) {
        const taskIndex = tasks.value[boardId].findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
          tasks.value[boardId].splice(taskIndex, 1);
          saveState();
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  return {
    // State
    boards,
    
    // Getters
    getBoard: (boardId) => _boards.value?.find(b => b.id === boardId),
    
    // Actions
    addBoard,
    updateBoard,
    deleteBoard,
    getTasks,
    addTask,
    updateTask,
    deleteTask,
    saveState,
    
    // Bulk restore from backup
    restoreFromBackup: (backup) => {
      try {
        const boardsData = Array.isArray(backup?.boards) ? backup.boards : [];
        const tasksData = backup?.tasks && typeof backup.tasks === 'object' ? backup.tasks : {};
        _boards.value = boardsData;
        _tasks.value = tasksData;
        saveState();
        return true;
      } catch (e) {
        console.error('Error restoring from backup:', e);
        return false;
      }
    },
    
    // For internal use
    _boards,
    _tasks
  };
});
