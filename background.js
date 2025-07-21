// Background service worker for LeetCode Sticky Notes extension

// Install event - initialize storage if needed
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const result = await chrome.storage.local.get(['leetcodeNotes']);
    if (!result.leetcodeNotes) {
      await chrome.storage.local.set({
        leetcodeNotes: {},
        noteCounter: 0
      });
    }
  } catch (error) {
    console.error('Error initializing storage:', error);
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveNote') {
    saveNote(request.note).then(sendResponse);
    return true; // Will respond asynchronously
  } else if (request.action === 'loadNotes') {
    loadNotes(request.problemUrl).then(sendResponse);
    return true;
  } else if (request.action === 'deleteNote') {
    deleteNote(request.noteId).then(sendResponse);
    return true;
  } else if (request.action === 'getAllNotes') {
    getAllNotes().then(sendResponse);
    return true;
  } else if (request.action === 'unlockNote') {
    unlockNote(request.noteId, request.password).then(sendResponse);
    return true;
  }
});

// Save note to storage
async function saveNote(note) {
  try {
    const result = await chrome.storage.local.get(['leetcodeNotes', 'noteCounter']);
    const notes = result.leetcodeNotes || {};
    const counter = result.noteCounter || 0;
    
    if (!note.id) {
      note.id = `note_${counter + 1}`;
      await chrome.storage.local.set({ noteCounter: counter + 1 });
    }
    
    // Get existing note if it exists
    const existingNote = notes[note.id];
    
    // If we're updating an existing note, preserve its state
    if (existingNote) {
      // If existing note is locked and we're not providing a new password,
      // preserve the locked state and don't overwrite encrypted content
      if (existingNote.isLocked && !note.password) {
        // Only update allowed fields for locked notes
        const allowedFields = ['position', 'minimized', 'hidden', 'title', 'lastModified'];
        const updatedNote = { ...existingNote };
        
        allowedFields.forEach(field => {
          if (note[field] !== undefined) {
            updatedNote[field] = note[field];
          }
        });
        
        updatedNote.lastModified = new Date().toISOString();
        notes[note.id] = updatedNote;
        
        await chrome.storage.local.set({ leetcodeNotes: notes });
        return { success: true, note: updatedNote };
      }
    }
    
    // Ensure backward compatibility - add title if missing
    if (!note.title) {
      note.title = generateDefaultTitle(note.content, note.problemTitle);
    }
    
    // Handle password protection
    if (note.password) {
      // Encrypt content if password is provided
      note.isLocked = true;
      note.encryptedContent = await encryptContent(note.content, note.password);
      // Don't store the actual password, only a hash for verification
      note.passwordHash = await hashPassword(note.password);
      // Clear the plaintext content and password from storage
      delete note.content;
      delete note.password;
    }
    
    note.lastModified = new Date().toISOString();
    notes[note.id] = note;
    
    await chrome.storage.local.set({ leetcodeNotes: notes });
    return { success: true, note: note };
  } catch (error) {
    console.error('Error saving note:', error);
    return { success: false, error: error.message };
  }
}

// Generate default title for notes
function generateDefaultTitle(content, problemTitle) {
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

// Load notes for specific problem
async function loadNotes(problemUrl) {
  try {
    const result = await chrome.storage.local.get(['leetcodeNotes']);
    const allNotes = result.leetcodeNotes || {};
    const problemNotes = Object.values(allNotes).filter(note => note.problemUrl === problemUrl);
    
    // Ensure backward compatibility - add titles to existing notes
    const updatedNotes = problemNotes.map(note => {
      if (!note.title) {
        note.title = generateDefaultTitle(note.content, note.problemTitle);
      }
      return note;
    });
    
    return { success: true, notes: updatedNotes };
  } catch (error) {
    console.error('Error loading notes:', error);
    return { success: false, error: error.message };
  }
}

// Delete note
async function deleteNote(noteId) {
  try {
    const result = await chrome.storage.local.get(['leetcodeNotes']);
    const notes = result.leetcodeNotes || {};
    delete notes[noteId];
    await chrome.storage.local.set({ leetcodeNotes: notes });
    return { success: true };
  } catch (error) {
    console.error('Error deleting note:', error);
    return { success: false, error: error.message };
  }
}

// Get all notes
async function getAllNotes() {
  try {
    const result = await chrome.storage.local.get(['leetcodeNotes']);
    const allNotes = result.leetcodeNotes || {};
    const notesArray = Object.values(allNotes);
    
    // Ensure backward compatibility - add titles to existing notes
    const updatedNotes = notesArray.map(note => {
      if (!note.title) {
        note.title = generateDefaultTitle(note.content || note.encryptedContent || '', note.problemTitle);
      }
      return note;
    });
    
    return { success: true, notes: updatedNotes };
  } catch (error) {
    console.error('Error getting all notes:', error);
    return { success: false, error: error.message };
  }
}

// Unlock note with password
async function unlockNote(noteId, password) {
  try {
    const result = await chrome.storage.local.get(['leetcodeNotes']);
    const notes = result.leetcodeNotes || {};
    const note = notes[noteId];
    
    if (!note) {
      return { success: false, error: 'Note not found' };
    }
    
    if (!note.isLocked) {
      return { success: false, error: 'Note is not locked' };
    }
    
    // Verify password
    const isPasswordCorrect = await verifyPassword(password, note.passwordHash);
    if (!isPasswordCorrect) {
      return { success: false, error: 'Incorrect password' };
    }
    
    // Decrypt content
    const decryptedContent = await decryptContent(note.encryptedContent, password);
    
    // Update note to unlocked state
    note.content = decryptedContent;
    note.isLocked = false;
    delete note.encryptedContent;
    delete note.passwordHash;
    note.lastModified = new Date().toISOString();
    
    // Save updated note
    await chrome.storage.local.set({ leetcodeNotes: notes });
    
    return { success: true, content: decryptedContent };
  } catch (error) {
    console.error('Error unlocking note:', error);
    return { success: false, error: error.message };
  }
}

// Simple encryption using Web Crypto API
async function encryptContent(content, password) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    
    // Generate salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    // Generate key from password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      data
    );
    
    // Combine salt, iv, and encrypted data
    const encryptedArray = new Uint8Array(encrypted);
    const result = new Uint8Array(salt.length + iv.length + encryptedArray.length);
    result.set(salt);
    result.set(iv, salt.length);
    result.set(encryptedArray, salt.length + iv.length);
    
    return btoa(String.fromCharCode.apply(null, result));
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

// Simple decryption using Web Crypto API
async function decryptContent(encryptedContent, password) {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Decode base64
    const encryptedData = new Uint8Array(atob(encryptedContent).split('').map(c => c.charCodeAt(0)));
    
    // Extract salt, iv, and encrypted data
    const salt = encryptedData.slice(0, 16);
    const iv = encryptedData.slice(16, 28);
    const encrypted = encryptedData.slice(28);
    
    // Generate key from password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
}

// Hash password for verification
async function hashPassword(password) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Password hashing error:', error);
    throw error;
  }
}

// Verify password against hash
async function verifyPassword(password, hash) {
  try {
    const hashedPassword = await hashPassword(password);
    return hashedPassword === hash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}