// Content script for LeetCode Sticky Notes extension

class LeetCodeStickyNotes {
  constructor() {
    this.notes = new Map();
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.currentProblemUrl = this.getCurrentProblemUrl();
    this.noteContainer = null;
    this.editingTitle = null;
    
    this.init();
  }

  init() {
    this.createNoteContainer();
    // Add delay for button placement to ensure DOM is ready
    setTimeout(() => {
      this.addCreateNoteButton();
    }, 500);
    this.loadExistingNotes();
    this.setupKeyboardShortcuts();
  }

  getCurrentProblemUrl() {
    // Extract problem slug from URL
    const pathMatch = window.location.pathname.match(/\/problems\/([^\/]+)/);
    return pathMatch ? pathMatch[1] : window.location.pathname;
  }

  createNoteContainer() {
    this.noteContainer = document.createElement('div');
    this.noteContainer.id = 'leetcode-notes-container';
    document.body.appendChild(this.noteContainer);
  }

  addCreateNoteButton() {
    // Don't add button if it already exists
    if (document.getElementById('leetcode-notes-btn')) {
      return;
    }
    
    // Create circular floating button
    const notesButton = document.createElement('button');
    notesButton.id = 'leetcode-notes-btn';
    notesButton.innerHTML = '📝';
    notesButton.title = 'LeetCode Notes - Click to view/create notes';
    notesButton.addEventListener('click', () => this.showAllNotesPanel());
    
    // Always use floating button position - bottom right corner
    notesButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      background: #ffa116;
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 24px;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 16px rgba(255, 161, 22, 0.3);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Add hover effects
    notesButton.addEventListener('mouseenter', () => {
      notesButton.style.transform = 'scale(1.1)';
      notesButton.style.boxShadow = '0 6px 20px rgba(255, 161, 22, 0.4)';
      notesButton.style.background = '#ff8c00';
    });
    
    notesButton.addEventListener('mouseleave', () => {
      notesButton.style.transform = 'scale(1)';
      notesButton.style.boxShadow = '0 4px 16px rgba(255, 161, 22, 0.3)';
      notesButton.style.background = '#ffa116';
    });
    
    document.body.appendChild(notesButton);
    console.log('LeetCode Notes: Circular floating button added');
  }

  createNote(existingNote = null) {
    const noteId = existingNote?.id || `note_${Date.now()}`;
    const note = document.createElement('div');
    note.className = 'leetcode-sticky-note';
    note.dataset.noteId = noteId;
    
    const isMinimized = existingNote?.minimized || false;
    if (isMinimized) {
      note.classList.add('minimized');
    }

    const noteTitle = existingNote?.title || 'New Note';

    // Check if note is locked
    const isLocked = existingNote?.isLocked || false;
    
    note.innerHTML = `
      <div class="note-header">
        <div class="note-drag-handle">⋮⋮</div>
        <div class="note-controls">
          <button class="note-lock" title="${isLocked ? 'Locked' : 'Lock Note'}" ${isLocked ? 'disabled' : ''}>
            ${isLocked ? '🔒' : '🔓'}
          </button>
          <button class="note-minimize" title="${isMinimized ? 'Maximize' : 'Minimize'}">
            ${isMinimized ? '□' : '−'}
          </button>
          <button class="note-delete" title="Hide">×</button>
        </div>
      </div>
      <div class="note-title-container">
        <h3 class="note-title" contenteditable="${!isLocked}" spellcheck="false">${this.escapeHtml(noteTitle)}</h3>
      </div>
      <div class="note-content" ${isMinimized ? 'style="display: none;"' : ''}>
        ${isLocked ? 
          `<div class="note-locked-content">
            <div class="lock-icon">🔒</div>
            <p>This note is password protected</p>
            <input type="password" class="unlock-password" placeholder="Enter password to unlock">
            <button class="unlock-btn">Unlock</button>
          </div>` :
          `<textarea placeholder="Enter your notes here..." class="note-textarea">${existingNote?.content || ''}</textarea>
           <div class="note-security-controls">
             <button class="set-password-btn" title="Set Password">🔒 Lock Note</button>
           </div>`
        }
      </div>
    `;

    // Position note
    if (existingNote?.position) {
      note.style.left = existingNote.position.x + 'px';
      note.style.top = existingNote.position.y + 'px';
    } else {
      note.style.left = '20px';
      note.style.top = '100px';
    }

    // Add event listeners
    this.setupNoteEventListeners(note);
    
    this.noteContainer.appendChild(note);
    this.notes.set(noteId, note);

    // Focus textarea if new note
    if (!existingNote) {
      const textarea = note.querySelector('.note-textarea');
      textarea.focus();
    }

    return note;
  }

  setupNoteEventListeners(note) {
    const header = note.querySelector('.note-header');
    const dragHandle = note.querySelector('.note-drag-handle');
    const minimizeBtn = note.querySelector('.note-minimize');
    const deleteBtn = note.querySelector('.note-delete');
    const lockBtn = note.querySelector('.note-lock');
    const textarea = note.querySelector('.note-textarea');
    const titleElement = note.querySelector('.note-title');
    const setPasswordBtn = note.querySelector('.set-password-btn');
    const unlockBtn = note.querySelector('.unlock-btn');
    const unlockPassword = note.querySelector('.unlock-password');

    // Drag functionality
    dragHandle.addEventListener('mousedown', (e) => this.startDrag(e, note));
    
    // Minimize/Maximize
    minimizeBtn.addEventListener('click', () => this.toggleMinimize(note));
    
    // Hide note (don't delete)
    deleteBtn.addEventListener('click', () => this.hideNote(note));
    
    // Lock/Unlock functionality
    if (lockBtn && !lockBtn.disabled) {
      lockBtn.addEventListener('click', () => this.showPasswordDialog(note));
    }
    
    // Auto-save on content change (only if not locked)
    if (textarea) {
      textarea.addEventListener('input', () => this.saveNote(note));
      textarea.addEventListener('blur', () => this.saveNote(note));
    }

    // Password setting
    if (setPasswordBtn) {
      setPasswordBtn.addEventListener('click', () => this.showPasswordDialog(note));
    }

    // Unlock functionality
    if (unlockBtn) {
      unlockBtn.addEventListener('click', () => this.unlockNote(note));
    }

    if (unlockPassword) {
      unlockPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.unlockNote(note);
        }
      });
    }

    // Title editing
    this.setupTitleEditing(titleElement, note);
  }

  setupTitleEditing(titleElement, note) {
    // Handle title editing
    titleElement.addEventListener('focus', () => {
      this.editingTitle = titleElement;
      titleElement.setAttribute('data-original-title', titleElement.textContent);
    });

    titleElement.addEventListener('blur', () => {
      this.finishTitleEdit(titleElement, note);
    });

    titleElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleElement.blur();
      } else if (e.key === 'Escape') {
        const originalTitle = titleElement.getAttribute('data-original-title');
        titleElement.textContent = originalTitle;
        titleElement.blur();
      }
    });

    // Prevent dragging when editing title
    titleElement.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }

  finishTitleEdit(titleElement, note) {
    const newTitle = titleElement.textContent.trim();
    
    if (!newTitle) {
      // Generate default title if empty
      const textarea = note.querySelector('.note-textarea');
      const content = textarea.value.trim();
      const problemTitle = this.getProblemTitle();
      titleElement.textContent = this.generateDefaultTitle(content, problemTitle);
    } else if (newTitle.length > 100) {
      // Limit title length
      titleElement.textContent = newTitle.substring(0, 97) + '...';
    }

    titleElement.removeAttribute('data-original-title');
    this.editingTitle = null;
    this.saveNote(note);
  }

  generateDefaultTitle(content, problemTitle) {
    if (content && content.trim()) {
      // Use first line of content, max 50 characters
      const firstLine = content.split('\n')[0].trim();
      return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;
    }
    
    if (problemTitle) {
      return `Notes for ${problemTitle}`;
    }
    
    return 'Untitled Note';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  startDrag(e, note) {
    // Don't drag if editing title
    if (this.editingTitle) {
      return;
    }

    this.isDragging = true;
    note.classList.add('dragging');
    
    const rect = note.getBoundingClientRect();
    this.dragOffset.x = e.clientX - rect.left;
    this.dragOffset.y = e.clientY - rect.top;

    const handleMouseMove = (e) => {
      if (!this.isDragging) return;
      
      const x = e.clientX - this.dragOffset.x;
      const y = e.clientY - this.dragOffset.y;
      
      // Keep note within viewport
      const maxX = window.innerWidth - note.offsetWidth;
      const maxY = window.innerHeight - note.offsetHeight;
      
      note.style.left = Math.max(0, Math.min(maxX, x)) + 'px';
      note.style.top = Math.max(0, Math.min(maxY, y)) + 'px';
    };

    const handleMouseUp = () => {
      this.isDragging = false;
      note.classList.remove('dragging');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      this.saveNote(note);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    e.preventDefault();
  }

  toggleMinimize(note) {
    const content = note.querySelector('.note-content');
    const minimizeBtn = note.querySelector('.note-minimize');
    const isMinimized = note.classList.contains('minimized');
    
    if (isMinimized) {
      note.classList.remove('minimized');
      content.style.display = 'block';
      minimizeBtn.textContent = '−';
      minimizeBtn.title = 'Minimize';
    } else {
      note.classList.add('minimized');
      content.style.display = 'none';
      minimizeBtn.textContent = '□';
      minimizeBtn.title = 'Maximize';
    }
    
    this.saveNote(note);
  }

  hideNote(note) {
    const noteId = note.dataset.noteId;
    
    // Just hide the note, don't delete from storage
    note.style.display = 'none';
    
    // Mark as hidden in our notes map but don't delete
    this.notes.set(noteId, { ...this.notes.get(noteId), hidden: true });
    
    // Update the note in storage to mark it as hidden
    this.saveNote(note);
  }

  deleteNote(note) {
    const noteId = note.dataset.noteId;
    
    if (confirm('Are you sure you want to delete this note?')) {
      // Remove from storage
      chrome.runtime.sendMessage({
        action: 'deleteNote',
        noteId: noteId
      });
      
      // Remove from DOM and memory
      note.remove();
      this.notes.delete(noteId);
    }
  }

  saveNote(note) {
    const noteId = note.dataset.noteId;
    const textarea = note.querySelector('.note-textarea');
    const titleElement = note.querySelector('.note-title');
    const rect = note.getBoundingClientRect();
    
    const noteData = {
      id: noteId,
      title: titleElement.textContent.trim(),
      content: textarea ? textarea.value : '',
      position: {
        x: parseInt(note.style.left),
        y: parseInt(note.style.top)
      },
      minimized: note.classList.contains('minimized'),
      hidden: note.style.display === 'none',
      problemUrl: this.currentProblemUrl,
      problemTitle: this.getProblemTitle(),
      createdAt: note.dataset.createdAt || new Date().toISOString()
    };
    
    if (!note.dataset.createdAt) {
      note.dataset.createdAt = noteData.createdAt;
    }

    chrome.runtime.sendMessage({
      action: 'saveNote',
      note: noteData
    });
  }

  showPasswordDialog(note) {
    const password = prompt('Enter a password to lock this note:');
    if (password && password.trim()) {
      this.lockNoteWithPassword(note, password.trim());
    }
  }

  lockNoteWithPassword(note, password) {
    const noteId = note.dataset.noteId;
    const textarea = note.querySelector('.note-textarea');
    const titleElement = note.querySelector('.note-title');
    
    const noteData = {
      id: noteId,
      title: titleElement.textContent.trim(),
      content: textarea.value,
      password: password,
      position: {
        x: parseInt(note.style.left),
        y: parseInt(note.style.top)
      },
      minimized: note.classList.contains('minimized'),
      hidden: note.style.display === 'none',
      problemUrl: this.currentProblemUrl,
      problemTitle: this.getProblemTitle(),
      createdAt: note.dataset.createdAt || new Date().toISOString()
    };

    chrome.runtime.sendMessage({
      action: 'saveNote',
      note: noteData
    }, (response) => {
      if (response.success) {
        // Refresh the note to show locked state
        this.refreshNote(note, { ...noteData, isLocked: true });
      } else {
        alert('Failed to lock note: ' + response.error);
      }
    });
  }

  unlockNote(note) {
    const noteId = note.dataset.noteId;
    const passwordInput = note.querySelector('.unlock-password');
    const password = passwordInput.value;
    
    if (!password) {
      alert('Please enter a password');
      return;
    }

    chrome.runtime.sendMessage({
      action: 'unlockNote',
      noteId: noteId,
      password: password
    }, (response) => {
      if (response.success) {
        // Replace locked content with unlocked content
        this.refreshNote(note, {
          content: response.content,
          isLocked: false
        });
      } else {
        alert('Failed to unlock note: ' + response.error);
        passwordInput.value = '';
        passwordInput.focus();
      }
    });
  }

  refreshNote(note, updatedData) {
    const noteId = note.dataset.noteId;
    const titleElement = note.querySelector('.note-title');
    const currentTitle = titleElement.textContent.trim();
    
    // Store current state
    const currentState = {
      id: noteId,
      title: currentTitle,
      position: {
        x: parseInt(note.style.left),
        y: parseInt(note.style.top)
      },
      minimized: note.classList.contains('minimized'),
      createdAt: note.dataset.createdAt,
      ...updatedData
    };

    // Remove old note
    note.remove();
    this.notes.delete(noteId);

    // Create new note with updated state
    const newNote = this.createNote(currentState);
    newNote.dataset.noteId = noteId;
    newNote.dataset.createdAt = note.dataset.createdAt;
  }

  getProblemTitle() {
    const titleElement = document.querySelector('[data-cy="question-title"]') ||
                        document.querySelector('.css-v3d350') ||
                        document.querySelector('h1');
    return titleElement ? titleElement.textContent.trim() : 'Unknown Problem';
  }

  loadExistingNotes() {
    chrome.runtime.sendMessage({
      action: 'loadNotes',
      problemUrl: this.currentProblemUrl
    }, (response) => {
      if (response.success && response.notes) {
        response.notes.forEach(noteData => {
          // Only create visible notes on load
          if (!noteData.hidden) {
            this.createNote(noteData);
          }
        });
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + N to create new note
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        this.createNote();
      }
    });
  }

  showAllNotesPanel() {
    // Remove existing panel if it exists
    const existingPanel = document.getElementById('leetcode-notes-panel');
    if (existingPanel) {
      existingPanel.remove();
      return;
    }

    // Create notes panel
    const panel = document.createElement('div');
    panel.id = 'leetcode-notes-panel';
    panel.className = 'leetcode-notes-panel';
    
    // Get all notes for current problem
    chrome.runtime.sendMessage({
      action: 'loadNotes',
      problemUrl: this.currentProblemUrl
    }, (response) => {
      if (response.success && response.notes) {
        this.renderNotesPanel(panel, response.notes);
      } else {
        this.renderNotesPanel(panel, []);
      }
    });

    document.body.appendChild(panel);
  }

  renderNotesPanel(panel, notes) {
    const problemTitle = this.getProblemTitle();
    
    panel.innerHTML = `
      <div class="notes-panel-header">
        <h3>📋 Notes for "${problemTitle}"</h3>
        <button class="notes-panel-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="notes-panel-content">
        ${notes.length === 0 ? 
          '<div class="no-notes">No notes found for this problem.<br>Click "Add Note" to create your first note!</div>' :
          notes.map(note => `
            <div class="note-preview ${note.hidden ? 'hidden-note' : ''}" data-note-id="${note.id}">
              <div class="note-preview-header">
                <h4 class="note-preview-title">${this.escapeHtml(note.title || 'Untitled Note')}</h4>
                <span class="note-preview-status ${note.hidden ? 'hidden' : note.isLocked ? 'locked' : note.minimized ? 'minimized' : 'expanded'}">
                  ${note.hidden ? 'Hidden' : note.isLocked ? 'Locked' : note.minimized ? 'Minimized' : 'Expanded'}
                </span>
              </div>
              <div class="note-preview-content">
                ${note.isLocked ? 
                  '<em>🔒 This note is password protected</em>' :
                  (note.content && note.content.length > 100 ? 
                    note.content.substring(0, 100) + '...' : 
                    note.content || '<em>Empty note</em>')}
              </div>
              <div class="note-preview-meta">
                <span class="note-preview-date">${new Date(note.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="note-preview-actions">
                <button class="note-action-btn reopen-btn" data-note-id="${note.id}" data-action="reopen">
                  👁️ Show Note
                </button>
                <button class="note-action-btn delete-btn" data-note-id="${note.id}" data-action="delete">
                  🗑️ Delete
                </button>
              </div>
            </div>
          `).join('')
        }
      </div>
      <div class="notes-panel-footer">
        <button class="notes-panel-btn" data-action="create-note">
          📝 Add New Note
        </button>
        <button class="notes-panel-btn" data-action="close-panel">
          Close Panel
        </button>
      </div>
    `;

    // Add click listeners for note previews
    panel.querySelectorAll('.note-preview').forEach(preview => {
      preview.addEventListener('click', (e) => {
        if (!e.target.classList.contains('note-action-btn')) {
          const noteId = preview.dataset.noteId;
          this.reopenNote(noteId);
        }
      });
    });

    // Add click listeners for action buttons
    panel.querySelectorAll('.note-action-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const noteId = button.dataset.noteId;
        const action = button.dataset.action;
        
        if (action === 'reopen') {
          this.reopenNote(noteId);
        } else if (action === 'delete') {
          this.deleteNoteFromPanel(noteId);
        }
      });
    });

    // Add click listeners for footer buttons
    panel.querySelectorAll('.notes-panel-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const action = button.dataset.action;
        
        if (action === 'create-note') {
          this.createNote();
          panel.remove();
        } else if (action === 'close-panel') {
          panel.remove();
        }
      });
    });
  }

  reopenNote(noteId) {
    chrome.runtime.sendMessage({
      action: 'loadNotes',
      problemUrl: this.currentProblemUrl
    }, (response) => {
      if (response.success && response.notes) {
        const noteData = response.notes.find(n => n.id === noteId);
        if (noteData) {
          // Remove hidden status and recreate note
          noteData.hidden = false;
          this.createNote(noteData);
          
          // Update just the hidden status in storage
          chrome.runtime.sendMessage({
            action: 'saveNote',
            note: {
              id: noteData.id,
              hidden: false
            }
          });
        }
      }
    });
  }

  deleteNoteFromPanel(noteId) {
    if (confirm('Are you sure you want to delete this note?')) {
      chrome.runtime.sendMessage({
        action: 'deleteNote',
        noteId: noteId
      }, (response) => {
        if (response.success) {
          // Refresh the panel
          const panel = document.getElementById('leetcode-notes-panel');
          if (panel) {
            panel.remove();
            this.showAllNotesPanel();
          }
        }
      });
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LeetCodeStickyNotes();
  });
} else {
  new LeetCodeStickyNotes();
}