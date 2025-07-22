// utils.js
function generateDefaultTitle(content, problemTitle) {
    if (content && content.trim()) {
        const firstLine = content.split('\n')[0].trim();
        return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;
    }

    if (problemTitle) {
        return `Notes for ${problemTitle}`;
    }

    return 'Untitled Note';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export these functions if you were in a module system,
// but for Chrome Extensions, they'll be globally available
// when included in manifest.json or imported with <script> tags.
// For now, we'll rely on their global availability.