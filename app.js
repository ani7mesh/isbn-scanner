// ==================== CONFIGURATION ====================
const CONFIG = {
    storageKey: 'scannedBooks',
    themeKey: 'theme',
    cacheKey: 'bookCache'
};

// ==================== STATE MANAGEMENT ====================
class BookScannerApp {
    constructor() {
        this.books = [];
        this.scanner = null;
        this.isScanning = false;
        
        this.initializeElements();
        this.loadBooks();
        this.loadTheme();
        this.bindEvents();
        
        console.log('App initialized');
    }
    
    initializeElements() {
        this.scannerPlaceholder = document.getElementById('scannerPlaceholder');
        this.scannerActive = document.getElementById('scannerActive');
        this.startScanBtn = document.getElementById('startScanBtn');
        this.stopScanBtn = document.getElementById('stopScanBtn');
        this.manualEntryBtn = document.getElementById('manualEntryBtn');
        this.cameraContainer = document.getElementById('cameraContainer');
        this.scannerStatusText = document.getElementById('scannerStatusText');
        
        this.manualModal = document.getElementById('manualModal');
        this.manualIsbnInput = document.getElementById('manualIsbnInput');
        this.cancelManualBtn = document.getElementById('cancelManualBtn');
        this.confirmManualBtn = document.getElementById('confirmManualBtn');
        
        this.booksList = document.getElementById('booksList');
        this.emptyState = document.getElementById('emptyState');
        this.bookCount = document.getElementById('bookCount');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        
        this.copyAllBtn = document.getElementById('copyAllBtn');
        this.emailBtn = document.getElementById('emailBtn');
        this.exportCsvBtn = document.getElementById('exportCsvBtn');
        
        this.themeToggle = document.getElementById('themeToggle');
        this.toast = document.getElementById('toast');
    }
    
    bindEvents() {
        this.startScanBtn.addEventListener('click', () => this.startScanner());
        this.stopScanBtn.addEventListener('click', () => this.stopScanner());
        this.manualEntryBtn.addEventListener('click', () => this.showManualEntry());
        
        this.cancelManualBtn.addEventListener('click', () => this.hideManualEntry());
        this.confirmManualBtn.addEventListener('click', () => this.processManualEntry());
        this.manualIsbnInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.processManualEntry();
        });
        
        this.copyAllBtn.addEventListener('click', () => this.copyAllISBNs());
        this.emailBtn.addEventListener('click', () => this.emailList());
        this.exportCsvBtn.addEventListener('click', () => this.exportCSV());
        this.clearAllBtn.addEventListener('click', () => this.clearAllBooks());
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }
    
    // ==================== SCANNER METHODS ====================
    async startScanner() {
        console.log('Starting scanner...');
        
        try {
            this.scannerPlaceholder.style.display = 'none';
            this.scannerActive.style.display = 'block';
            
            // Simple approach - just use HTML5-QRCode
            await this.startHtml5QrScanner();
            this.isScanning = true;
        } catch (error) {
            console.error('Scanner error:', error);
            alert('Scanner error: ' + error.message);
        }
    }
    
    async startHtml5QrScanner() {
        this.updateScannerStatus('Starting camera...');
        
        // Check if library is loaded
        if (typeof Html5Qrcode === 'undefined') {
            console.error('Html5Qrcode library not loaded!');
            this.updateScannerStatus('Scanner library not loaded. Check internet connection.');
            return;
        }
        
        // Clear container
        this.cameraContainer.innerHTML = '';
        
        // Create scanner instance
        this.scanner = new Html5Qrcode('cameraContainer');
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 150 }
        };
        
        try {
            await this.scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    console.log('Scanned:', decodedText);
                    this.handleScannedISBN(decodedText);
                },
                () => {} // ignore errors
            );
            
            this.updateScannerStatus('Scanner active - point at ISBN barcode');
        } catch (error) {
            console.error('Failed to start scanner:', error);
            this.updateScannerStatus('Failed to start camera: ' + error.message);
        }
    }
    
    stopScanner() {
        if (this.scanner) {
            this.scanner.stop().then(() => {
                this.scanner.clear();
                console.log('Scanner stopped');
            }).catch(err => {
                console.warn('Stop error:', err);
            });
            this.scanner = null;
        }
        
        this.isScanning = false;
        this.scannerActive.style.display = 'none';
        this.scannerPlaceholder.style.display = 'flex';
    }
    
    handleScannedISBN(rawValue) {
        console.log('Raw scan value:', rawValue);
        
        // SIMPLE ISBN CLEANING - just take numbers
        let isbn = rawValue.replace(/[^0-9]/g, '');
        
        console.log('Cleaned to:', isbn);
        
        // Remove leading '978' if it's actually a UPC code
        if (isbn.length === 12 && (isbn.startsWith('978') || isbn.startsWith('979'))) {
            // Calculate check digit and add it
            isbn = this.calculateCheckDigit(isbn);
        }
        
        // Accept any ISBN that's 10-13 digits
        if (isbn.length < 10 || isbn.length > 13) {
            console.warn('Invalid ISBN length:', isbn.length);
            this.showToast('Invalid ISBN: ' + rawValue);
            return;
        }
        
        // Check for duplicates
        if (this.books.some(book => book.isbn === isbn)) {
            this.showToast('Book already scanned!');
            return;
        }
        
        // Add book
        const book = {
            isbn: isbn,
            title: '',
            author: '',
            scannedAt: new Date().toISOString()
        };
        
        this.books.push(book);
        this.saveBooks();
        this.renderBooks();
        
        // Try to lookup
        this.lookupBook(isbn, this.books.length - 1);
        
        // Feedback
        if (navigator.vibrate) navigator.vibrate(100);
        this.showToast('ISBN: ' + isbn);
    }
    
    calculateCheckDigit(isbn12) {
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(isbn12[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        return isbn12 + checkDigit;
    }
    
    // ==================== BOOK LOOKUP ====================
    async lookupBook(isbn, index) {
        console.log('Looking up:', isbn);
        
        // Try Google Books first
        try {
            const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
            console.log('Fetching:', url);
            
            const response = await fetch(url);
            const data = await response.json();
            
            console.log('Google Books response:', data);
            
            if (data.items && data.items[0]) {
                const book = data.items[0].volumeInfo;
                this.books[index].title = book.title || 'Unknown';
                this.books[index].author = book.authors ? book.authors[0] : 'Unknown';
                this.saveBooks();
                this.renderBooks();
                console.log('Found:', book.title);
                return;
            }
        } catch (error) {
            console.warn('Google Books failed:', error);
        }
        
        // Try Open Library
        try {
            const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`;
            console.log('Fetching:', url);
            
            const response = await fetch(url);
            const data = await response.json();
            
            console.log('Open Library response:', data);
            
            const key = `ISBN:${isbn}`;
            if (data[key] && data[key].title) {
                this.books[index].title = data[key].title;
                this.books[index].author = data[key].authors ? data[key].authors[0].name : 'Unknown';
                this.saveBooks();
                this.renderBooks();
                console.log('Found:', data[key].title);
                return;
            }
        } catch (error) {
            console.warn('Open Library failed:', error);
        }
        
        console.log('No lookup results for:', isbn);
        this.books[index].title = 'Not found - will remain as ISBN only';
        this.saveBooks();
        this.renderBooks();
    }
    
    // ==================== UI METHODS ====================
    renderBooks() {
        this.booksList.innerHTML = '';
        
        if (this.books.length === 0) {
            this.booksList.innerHTML = `
                <div class="empty-state">
                    <p>Scan your first book to begin</p>
                    <p class="subtitle">ISBNs will appear here</p>
                </div>
            `;
            this.bookCount.textContent = '0 books';
            this.updateExportButtons();
            return;
        }
        
        this.books.forEach((book, index) => {
            const div = document.createElement('div');
            div.className = 'book-item';
            div.innerHTML = `
                <div class="book-info">
                    <div class="book-isbn">${book.isbn}</div>
                    <div class="book-title">${book.title || 'Looking up...'}</div>
                    ${book.author ? `<div style="font-size: 0.875rem; color: #64748b;">${book.author}</div>` : ''}
                </div>
                <div class="book-actions">
                    <button onclick="app.copyISBN('${book.isbn}')" class="icon-btn-sm">📋</button>
                    <button onclick="app.removeBook(${index})" class="icon-btn-sm">✕</button>
                </div>
            `;
            this.booksList.appendChild(div);
        });
        
        this.bookCount.textContent = `${this.books.length} books`;
        this.clearAllBtn.style.display = 'inline-flex';
        this.updateExportButtons();
    }
    
    updateScannerStatus(message) {
        if (this.scannerStatusText) {
            this.scannerStatusText.textContent = message;
        }
    }
    
    showManualEntry() {
        this.manualModal.style.display = 'flex';
        setTimeout(() => this.manualIsbnInput.focus(), 100);
    }
    
    hideManualEntry() {
        this.manualModal.style.display = 'none';
        this.manualIsbnInput.value = '';
    }
    
    processManualEntry() {
        const isbn = this.manualIsbnInput.value.trim();
        if (isbn) {
            this.handleScannedISBN(isbn);
            this.hideManualEntry();
        }
    }
    
    async copyISBN(isbn) {
        try {
            await navigator.clipboard.writeText(isbn);
            this.showToast('Copied: ' + isbn);
        } catch (error) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = isbn;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast('Copied: ' + isbn);
        }
    }
    
    async copyAllISBNs() {
        if (this.books.length === 0) return;
        
        const isbns = this.books.map(book => book.isbn).join('\n');
        
        try {
            await navigator.clipboard.writeText(isbns);
            this.showToast(`Copied ${this.books.length} ISBNs!`);
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = isbns;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast(`Copied ${this.books.length} ISBNs!`);
        }
    }
    
    emailList() {
        if (this.books.length === 0) return;
        
        const subject = encodeURIComponent('My Book List');
        const body = encodeURIComponent(
            this.books.map(book => `${book.isbn}${book.title ? ' - ' + book.title : ''}`).join('\n')
        );
        
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
    
    exportCSV() {
        if (this.books.length === 0) return;
        
        const csv = [
            'ISBN,Title,Author',
            ...this.books.map(book => `${book.isbn},${book.title || ''},${book.author || ''}`)
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'books.csv';
        a.click();
        URL.revokeObjectURL(url);
    }
    
    removeBook(index) {
        this.books.splice(index, 1);
        this.saveBooks();
        this.renderBooks();
        this.showToast('Book removed');
    }
    
    clearAllBooks() {
        if (confirm('Clear all books?')) {
            this.books = [];
            this.saveBooks();
            this.renderBooks();
            this.showToast('All books cleared');
        }
    }
    
    updateExportButtons() {
        const hasBooks = this.books.length > 0;
        this.copyAllBtn.disabled = !hasBooks;
        this.emailBtn.disabled = !hasBooks;
        this.exportCsvBtn.disabled = !hasBooks;
    }
    
    // ==================== STORAGE ====================
    saveBooks() {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.books));
    }
    
    loadBooks() {
        const stored = localStorage.getItem(CONFIG.storageKey);
        if (stored) {
            this.books = JSON.parse(stored);
        }
        this.renderBooks();
    }
    
    // ==================== THEME ====================
    loadTheme() {
        const theme = localStorage.getItem(CONFIG.themeKey) || 'light';
        document.documentElement.setAttribute('data-theme', theme);
    }
    
    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(CONFIG.themeKey, newTheme);
    }
    
    // ==================== UTILITIES ====================
    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.toast.classList.remove('show');
        }, 2000);
    }
}

// ==================== INITIALIZE ====================
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new BookScannerApp();
});

window.app = app;