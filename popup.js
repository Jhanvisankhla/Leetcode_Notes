
class NotesPopup {
  constructor() {
    this.notes = [];
    this.filteredNotes = [];
    this.currentSearch = '';
    this.currentSort = 'recent';
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadNotes();
  }

  setupEventListeners() {
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.currentSearch = e.target.value.toLowerCase();
      this.filterAndDisplayNotes();
    });

    document.getElementById('clear-search').addEventListener('click', () => {
      document.getElementById('search-input').value = '';
      this.currentSearch = '';
      this.filterAndDisplayNotes();
    });

    document.getElementById('sort-select').addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.filterAndDisplayNotes();
    });

    // Refresh notes
    document.getElementById('refresh-notes').addEventListener('click', () => {
      this.loadNotes();
    });

    // Export notes
    document.getElementById('export-notes').addEventListener('click', () => {
      this.exportNotes();
    });

    // Clear all notes
    document.getElementById('clear-all-notes').addEventListener('click', () => {
      this.clearAllNotes();
    });

    document.getElementById('visit-leetcode').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://leetcode.com/problemset/' });
    });
  }

  loadNotes() {
    chrome.runtime.sendMessage({ action: 'getAllNotes' }, (response) => {
      if (response.success) {
        this.notes = response.notes || [];
        this.updateNotesCount();
        this.filterAndDisplayNotes();
      } else {
        console.error('Error loading notes:', response.error);
        this.showError('Failed to load notes');
      }
    });
  }

  updateNotesCount() {
    const count = this.notes.length;
    document.getElementById('notes-count').textContent = 
      count === 1 ? '1 note' : `${count} notes`;
  }

  filterAndDisplayNotes() {
    this.filteredNotes = this.notes.filter(note => {
      if (!this.currentSearch) return true;
      
      const searchTerm = this.currentSearch;
      return (
        (note.title && note.title.toLowerCase().includes(searchTerm)) ||
        (note.content && note.content.toLowerCase().includes(searchTerm)) ||
        (note.problemTitle && note.problemTitle.toLowerCase().includes(searchTerm)) ||
        (note.problemUrl && note.problemUrl.toLowerCase().includes(searchTerm))
      );
    });

    this.sortNotes();
    
    // Display notes
    this.displayNotes();
  }

  sortNotes() {
    switch (this.currentSort) {
      case 'recent':
        this.filteredNotes.sort((a, b) => 
          new Date(b.lastModified || b.createdAt) - new Date(a.lastModified || a.createdAt)
        );
        break;
      case 'oldest':
        this.filteredNotes.sort((a, b) => 
          new Date(a.createdAt) - new Date(b.createdAt)
        );
        break;
      case 'problem':
        this.filteredNotes.sort((a, b) => 
          (a.problemTitle || '').localeCompare(b.problemTitle || '')
        );
        break;
      case 'title':
        this.filteredNotes.sort((a, b) => 
          (a.title || '').localeCompare(b.title || '')
        );
        break;
      case 'content':
        this.filteredNotes.sort((a, b) => 
          (b.content || '').length - (a.content || '').length
        );
        break;
    }
  }

  displayNotes() {
    const notesList = document.getElementById('notes-list');
    const emptyState = document.getElementById('empty-state');

    if (this.filteredNotes.length === 0) {
      notesList.innerHTML = '';
      emptyState.style.display = 'block';
    }else{
      emptyState.style.display = 'none'; 
      notesList.innerHTML = ''; // Clear notes list before re-populating
      
      this.filteredNotes.forEach(note => {
          const noteElement = this.createNoteElement(note);
          notesList.appendChild(noteElement);
      });
    }
  }

  createNoteElement(note) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'note-item';
    noteDiv.dataset.noteId = note.id;

    const createdDate = new Date(note.createdAt).toLocaleDateString();
    const modifiedDate = note.lastModified ? 
      new Date(note.lastModified).toLocaleDateString() : createdDate;
    
    const preview = note.content && note.content.length > 80 ? 
      note.content.substring(0, 80) + '...' : (note.content || 'Empty note');

    const noteTitle = note.title || 'Untitled Note';
    const problemTitle = note.problemTitle || 'Unknown Problem';

    noteDiv.innerHTML = `
      <div class="note-item-header">
        <div class="note-titles">
          <h3 class="note-title">${escapeHtml(noteTitle)}</h3>
          <h4 class="note-problem-title">${escapeHtml(problemTitle)}</h4>
        </div>
        <div class="note-actions">
          <button class="note-action-btn" data-action="open" title="Open problem">🔗</button>
          <button class="note-action-btn" data-action="delete" title="Delete note">🗑️</button>
        </div>
      </div>
      <div class="note-content-preview">
        ${escapeHtml(preview)}
      </div>
      <div class="note-metadata">
        <span class="note-date">Created: ${createdDate}</span>
        ${modifiedDate !== createdDate ? `<span class="note-date">Modified: ${modifiedDate}</span>` : ''}
        <span class="note-status ${note.minimized ? 'minimized' : 'expanded'}">
          ${note.minimized ? 'Minimized' : 'Expanded'}
        </span>
      </div>
    `;

    // Add event listeners
    noteDiv.querySelector('[data-action="open"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openProblem(note);
    });

    noteDiv.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteNote(note);
    });

    // Make entire note clickable to open problem
    noteDiv.addEventListener('click', () => {
      this.openProblem(note);
    });

    return noteDiv;
  }

  openProblem(note) {
    const url = `https://leetcode.com/problems/${note.problemUrl}/`;
    chrome.tabs.create({ url: url });
  }

  deleteNote(note) {
    const noteTitle = note.title || 'Untitled Note';
    if (confirm(`Are you sure you want to delete "${noteTitle}"?`)) {
      chrome.runtime.sendMessage({
        action: 'deleteNote',
        noteId: note.id
      }, (response) => {
        if (response.success) {
          this.loadNotes(); // Refresh the list
        } else {
          this.showError('Failed to delete note');
        }
      });
    }
  }

  exportNotes() {
    if (this.notes.length === 0) {
      alert('No notes to export!');
      return;
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      notesCount: this.notes.length,
      notes: this.notes.map(note => ({
        title: note.title,
        problemTitle: note.problemTitle,
        problemUrl: note.problemUrl,
        content: note.content,
        createdAt: note.createdAt,
        lastModified: note.lastModified
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leetcode-notes-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  clearAllNotes() {
    if (this.notes.length === 0) {
      alert('No notes to clear!');
      return;
    }

    const confirmMessage = `Are you sure you want to delete all ${this.notes.length} notes? This action cannot be undone.`;
    
    if (confirm(confirmMessage)) {
      // Delete each note
      const deletePromises = this.notes.map(note => 
        new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'deleteNote',
            noteId: note.id
          }, resolve);
        })
      );

      Promise.all(deletePromises).then(() => {
        this.loadNotes(); // Refresh the list
      });
    }
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    document.querySelector('.popup-container').prepend(errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new NotesPopup();
});
