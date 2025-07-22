
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

async function generateSalt() {
    return crypto.getRandomValues(new Uint8Array(16)); // 16 bytes for a good salt
}

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

    const existingNote = notes[note.id];
    if (existingNote && existingNote.isLocked && !note.password) {
      const allowedFields = ['position', 'minimized', 'hidden', 'title', 'lastModified'];
      const updatedNote = { ...existingNote };

      allowedFields.forEach(field => {
          if (note[field] !== undefined) {
              updatedNote[field] = note[field];
          }
      });
          
      // Re-generate default title if title is empty on update
      if (!updatedNote.title || updatedNote.title.trim() === '') {
          updatedNote.title = generateDefaultTitle(updatedNote.content || '', updatedNote.problemTitle);
      }
      updatedNote.lastModified = new Date().toISOString();
      notes[note.id] = updatedNote;

      await chrome.storage.local.set({ leetcodeNotes: notes });
      return { success: true, note: updatedNote };
    }

    if (!note.title || note.title.trim() === '') {
        note.title = generateDefaultTitle(note.content, note.problemTitle);
    }

      // Handle password protection for new lock or relock
    if (note.password) {
      note.isLocked = true;
      note.encryptedContent = await encryptContent(note.content, note.password);
      
      // Generate and store a new salt for the password hash
      const salt = await generateSalt();
      note.passwordSalt = btoa(String.fromCharCode.apply(null, salt)); // Store salt in base64
      note.passwordHash = await hashPasswordWithSalt(note.password, salt); // Hash password with the new salt
      
      // Clear the plaintext content and password from note object before storage
      delete note.content;
      delete note.password;
    } 
    else if (existingNote && !note.password && !note.isLocked && existingNote.passwordHash) {
      // If a note was unlocked, clear its password-related fields
      delete note.passwordHash;
      delete note.passwordSalt;
      delete note.encryptedContent;
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
    const isPasswordCorrect = await verifyPassword(password, note.passwordHash,note.passwordSalt);
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
    delete note.passwordSalt;
    note.lastModified = new Date().toISOString();
    
    // Save updated note
    await chrome.storage.local.set({ leetcodeNotes: notes });
    
    return { success: true, content: decryptedContent };
  } 
  catch (error) {
    console.error('Error unlocking note:', error);
    return { success: false, error: error.message };
  }
}

//encryption using Web Crypto API
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

//decryption using Web Crypto API
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
async function hashPasswordWithSalt(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const hashedPasswordBuffer = await crypto.subtle.deriveBits(
  {
    name: 'PBKDF2',
    salt: salt,
    iterations: 100000,
    hash: 'SHA-256'
  },
    keyMaterial,
    256 // Output bits for SHA-256 hash
  );

  const hashedPasswordArray = Array.from(new Uint8Array(hashedPasswordBuffer));
  return hashedPasswordArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify password against hash
async function verifyPassword(password, storedHash, storedSaltBase64) {
  try{
    const salt = new Uint8Array(atob(storedSaltBase64).split('').map(c => c.charCodeAt(0)));
    const hashedPassword = await hashPasswordWithSalt(password, salt);
    return hashedPassword === storedHash;
  }catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}