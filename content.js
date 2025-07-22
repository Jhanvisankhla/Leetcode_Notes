function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}
class LeetCodeStickyNotes {
  constructor() {
    this.notes = new Map();
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.noteContainer = null;
    this.editingTitle = null;
    this.saveNoteDebounced = debounce(this.saveNote.bind(this), 500);

    //Properties to track the current page state
    this.problemTitle = 'Unknown Problem';
    this.currentProblemSlug = null;
    
    this.init();
  }


  init() {
    this.currentProblemSlug = this.getProblemSlug();
    this.setupUrlObserver(); // Start watching for page changes
    this.runPageSetup();     // Run setup for the initial page
  }


  runPageSetup() {
    console.log("LeetCode Notes: Setting up for problem ->", this.currentProblemSlug);
    this.problemTitle = 'Unknown Problem'; // Reset title
    this.findTitleWithRetry();             // Find title for the new page

    // Reset the notes container for the new page
    if (this.noteContainer) {
      this.noteContainer.innerHTML = '';
    } else {
      this.createNoteContainer();
    }
    
    this.notes.clear();
    this.addCreateNoteButton();  
    this.loadExistingNotes();     // Load notes for the new problem
    this.setupKeyboardShortcuts();
  }

  setupUrlObserver() {
    setInterval(() => {
        const newSlug = this.getProblemSlug();
        if (newSlug && newSlug !== this.currentProblemSlug) {
            console.log(`LeetCode Notes: Navigation detected. New problem: ${newSlug}`);
            this.currentProblemSlug = newSlug;
            this.runPageSetup(); //Re-run everything for the new page.
        }
    }, 500); // Check the URL every half-second
  }

  
  getProblemSlug() {
    const pathMatch = window.location.pathname.match(/\/problems\/([^\/]+)/);
    return pathMatch ? pathMatch[1] : null;
  }

  
  getProblemTitle() {
    //Try to get the title directly from the page's HTML.
    const titleElement = document.querySelector('[data-cy="question-title"]');
    if (titleElement && titleElement.innerText.trim()) {
      const fullTitle = titleElement.innerText.trim();
      const titleParts = fullTitle.split('. ');
      return titleParts.length > 1 ? titleParts[1] : titleParts[0];
    }
    
    // If the HTML element isn't found, build the title from the URL slug.
    const slug = this.getProblemSlug();
    if (slug) {
      return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    
    // Absolute fallback.
    return 'Unknown Problem';
  }

  findTitleWithRetry() {
    let attempts = 0;
    const maxAttempts = 20; // 5 seconds total

    const intervalId = setInterval(() => {
      const foundTitle = this.getProblemTitle();
      if (foundTitle && foundTitle !== 'Unknown Problem') {
        this.problemTitle = foundTitle;
        console.log(`LeetCode Notes: Title found -> "${this.problemTitle}"`);
        clearInterval(intervalId);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
      attempts++;
    }, 250);
  }

  
  loadExistingNotes() {
    if (!this.currentProblemSlug) return;
    chrome.runtime.sendMessage({
      action: 'loadNotes',
      problemUrl: this.currentProblemSlug // Uses the correctly updated slug
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error loading notes:", chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success && response.notes) {
        response.notes.forEach(noteData => {
          if (!noteData.hidden) this.createNote(noteData);
        });
      }
    });
  }

  saveNote(note) {
    const noteId = note.dataset.noteId;
    const textarea = note.querySelector('.note-textarea');
    const titleElement = note.querySelector('.note-title');
    
    const noteData = {
      id: noteId,
      title: titleElement.textContent.trim(),
      content: textarea ? textarea.value : '',
      position: { x: parseInt(note.style.left), y: parseInt(note.style.top) },
      minimized: note.classList.contains('minimized'),
      hidden: note.style.display === 'none',
      problemUrl: this.currentProblemSlug, // Uses the correctly updated slug
      problemTitle: this.problemTitle,     // Uses the correctly updated title
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
    
    //hover effects
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
    const notePosition = existingNote?.position || { x: 20, y: 100 };
    const isHidden = existingNote?.hidden || false;
    const isMinimized = existingNote?.minimized || false;
    const newNote = {
        id: existingNote?.id || `note_${Date.now()}_${this.noteCounter++}`,
        content: existingNote?.content || '',
        position: notePosition,
        minimized: isMinimized,
        hidden: isHidden,
        createdAt: existingNote?.createdAt || new Date().toISOString(),
        lastModified: new Date().toISOString(),
        problemTitle: this.problemTitle, 
        problemUrl: this.currentProblemSlug,
        isLocked: existingNote?.isLocked || false,
        encryptedContent: existingNote?.encryptedContent || null,
        passwordHash: existingNote?.passwordHash || null,
        passwordSalt: existingNote?.passwordSalt || null
    }
    newNote.title = existingNote?.title || generateDefaultTitle(newNote.content, newNote.problemTitle);
    const noteId = newNote.id;
    const note = document.createElement('div');
    note.className = 'leetcode-sticky-note';
    note.dataset.noteId = noteId;
    if (isMinimized) {
      note.classList.add('minimized');
    }

    const noteTitle = existingNote?.title || 'New Note';

    // Check if note is locked
    const isLocked = existingNote?.isLocked || false;
    
    note.innerHTML = `
        <div class="note-header">
            <div class="note-drag-handle" title="Drag note">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/>
                <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
                <circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>
            </svg>
            </div>
            <div class="note-controls">
            <button class="note-lock" title="${isLocked ? 'Locked' : 'Lock Note'}" ${isLocked ? 'disabled' : ''}>
                ${isLocked ? 
                `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` : 
                `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`
                }
            </button>
            <button class="note-minimize" title="${isMinimized ? 'Maximize' : 'Minimize'}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button class="note-delete" title="Hide">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            </div>
        </div>
        <div class="note-title-container">
            <h3 class="note-title" contenteditable="${!isLocked}" spellcheck="false">${escapeHtml(noteTitle)}</h3>
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
    
    // Hide note
    deleteBtn.addEventListener('click', () => this.hideNote(note));
    
    // Lock/Unlock functionality
    if (lockBtn && !lockBtn.disabled) {
      lockBtn.addEventListener('click', () => this.displayPasswordSetupUI(note));
    }
    
    // Auto-save on content change (only if not locked)
    if (textarea) {
      textarea.addEventListener('input', () => this.saveNoteDebounced(note));
      textarea.addEventListener('blur', () => this.saveNote(note));
    }

    // Password setting
    if (setPasswordBtn) {
      setPasswordBtn.addEventListener('click', () => this.displayPasswordSetupUI(note));
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

  displayPasswordSetupUI(note) {
    const securityControls = note.querySelector('.note-security-controls');
    if (!securityControls) return;

    // Store the original "Lock Note" button to restore it on cancel.
    const originalControlsHTML = securityControls.innerHTML;

    securityControls.innerHTML = `
        <div class="password-setup-container">
        <div class="password-input-wrapper">
            <input type="password" class="password-setup-input" placeholder="Enter password...">
            <button class="password-toggle-visibility" title="Show password">👁️</button>
        </div>
        <div class="password-setup-actions">
            <button class="password-confirm-btn">Set</button>
            <button class="password-cancel-btn">Cancel</button>
        </div>
        </div>
    `;

    const passwordInput = securityControls.querySelector('.password-setup-input');
    const confirmBtn = securityControls.querySelector('.password-confirm-btn');
    const cancelBtn = securityControls.querySelector('.password-cancel-btn');
    const toggleBtn = securityControls.querySelector('.password-toggle-visibility');

    passwordInput.focus();

    // Event listener for the "Set" button
    confirmBtn.addEventListener('click', () => {
        const password = passwordInput.value;
        if (password && password.trim()) {
        this.lockNoteWithPassword(note, password.trim());
        }
    });

    // Event listener for the "Cancel" button
    cancelBtn.addEventListener('click', () => {
        securityControls.innerHTML = originalControlsHTML;
        // Re-attach the event listener to the restored button
        const newSetPasswordBtn = securityControls.querySelector('.set-password-btn');
        if (newSetPasswordBtn) {
            newSetPasswordBtn.addEventListener('click', () => this.displayPasswordSetupUI(note));
        }
    });

    toggleBtn.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.textContent = '🙈';
        toggleBtn.title = 'Hide password';
        } else {
        passwordInput.type = 'password';
        toggleBtn.textContent = '👁️';
        toggleBtn.title = 'Show password';
        }
    });
  }

  setupTitleEditing(titleElement, note) {
    // Handle title editing
    titleElement.addEventListener('focus', () => {
      this.editingTitle = titleElement;
      titleElement.setAttribute('data-original-title', titleElement.textContent);
    });

    titleElement.addEventListener('blur', () => {
      this.finishTitleEdit(titleElement, note);
      this.saveNote(note);
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
      titleElement.textContent = generateDefaultTitle(content, problemTitle);
    } else if (newTitle.length > 100) {
      // Limit title length
      titleElement.textContent = newTitle.substring(0, 97) + '...';
    }

    titleElement.removeAttribute('data-original-title');
    this.editingTitle = null;
    this.saveNote(note);
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
    
    note.style.display = 'none';
    this.notes.set(noteId, { ...this.notes.get(noteId), hidden: true });
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
      problemUrl: this.currentProblemSlug,
      problemTitle: this.getProblemTitle(),
      createdAt: note.dataset.createdAt || new Date().toISOString()
    };

    chrome.runtime.sendMessage({
      action: 'saveNote',
      note: noteData
    }, (response) => {
      if (response.success) {
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


  loadExistingNotes() {
    chrome.runtime.sendMessage({
      action: 'loadNotes',
      problemUrl: this.currentProblemSlug
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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
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
      problemUrl: this.currentProblemSlug
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
    const problemTitle = this.problemTitle;
    
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
                <h4 class="note-preview-title">${escapeHtml(note.title || 'Untitled Note')}</h4>
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
                <button class="note-action-btn" data-note-id="${note.id}" data-action="reopen" title="Show Note on Page">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <button class="note-action-btn delete-btn" data-note-id="${note.id}" data-action="delete" title="Delete Note">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
      problemUrl: this.currentProblemSlug
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