// ==================== CONFIGURATION ====================
const CONFIG = {
    // Book lookup sources in priority order
    lookupSources: [
        {
            name: 'Google Books',
            endpoint: (isbn) => `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
            parse: (data) => {
                if (data.items && data.items[0]) {
                    const book = data.items[0].volumeInfo;
                    return {
                        title: book.title || 'Unknown Title',
                        author: book.authors ? book.authors[0] : 'Unknown Author',
                        cover: book.imageLinks?.thumbnail || null
                    };
                }
                return null;
            }
        },
        {
            name: 'Open Library',
            endpoint: (isbn) => `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`,
            parse: (data) => {
                const key = `ISBN:${isbn}`;
                if (data[key]) {
                    return {
                        title: data[key].title || 'Unknown Title',
                        author: data[key].authors ? data[key].authors[0].name : 'Unknown Author',
                        cover: data[key].cover ? data[key].cover.medium : null
                    };
                }
                return null;
            }
        },
        {
            name: 'ISBNdb',
            endpoint: (isbn) => `https://api2.isbndb.com/book/${isbn}`,
            parse: (data) => {
                if (data.book) {
                    return {
                        title: data.book.title || 'Unknown Title',
                        author: data.book.authors ? data.book.authors[0] : 'Unknown Author',
                        cover: data.book.image || null
                    };
                }
                return null;
            }
        }
    ],
    
    // Scanner fallback order
    scannerPriority: ['native', 'html5qrcode', 'manual'],
    
    // Timeouts
    lookupTimeout: 5000,
    
    // Storage
    storageKey: 'scannedBooks',
    themeKey: 'theme'
};

// ==================== STATE MANAGEMENT ====================
class BookScannerApp {
    constructor() {
        this.books = [];
        this.scanner = null;
        this.isScanning = false;
        this.currentScannerType = null;
        
        this.initializeElements();
        this.loadBooks();
        this.loadTheme();
        this.bindEvents();
        this.checkScannerSupport();
    }
    
    initializeElements() {
        // Scanner elements
        this.scannerPlaceholder = document.getElementById('scannerPlaceholder');
        this.scannerActive = document.getElementById('scannerActive');
        this.startScanBtn = document.getElementById('startScanBtn');
        this.stopScanBtn = document.getElementById('stopScanBtn');
        this.manualEntryBtn = document.getElementById('manualEntryBtn');
        this.cameraContainer = document.getElementById('cameraContainer');
        this.scannerStatusText = document.getElementById('scannerStatusText');
        
        // Manual entry modal
        this.manualModal = document.getElementById('manualModal');
        this.manualIsbnInput = document.getElementById('manualIsbnInput');
        this.cancelManualBtn = document.getElementById('cancelManualBtn');
        this.confirmManualBtn = document.getElementById('confirmManualBtn');
        
        // Books list
        this.booksList = document.getElementById('booksList');
        this.emptyState = document.getElementById('emptyState');
        this.bookCount = document.getElementById('bookCount');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        
        // Export buttons
        this.copyAllBtn = document.getElementById('copyAllBtn');
        this.emailBtn = document.getElementById('emailBtn');
        this.exportCsvBtn = document.getElementById('exportCsvBtn');
        
        // Theme toggle
        this.themeToggle = document.getElementById('themeToggle');
        this.themeIcon = document.getElementById('themeIcon');
        
        // Toast
        this.toast = document.getElementById('toast');
    }
    
    bindEvents() {
        // Scanner controls
        this.startScanBtn.addEventListener('click', () => this.startScanner());
        this.stopScanBtn.addEventListener('click', () => this.stopScanner());
        this.manualEntryBtn.addEventListener('click', () => this.showManualEntry());
        
        // Manual entry
        this.cancelManualBtn.addEventListener('click', () => this.hideManualEntry());
        this.confirmManualBtn.addEventListener('click', () => this.processManualEntry());
        this.manualIsbnInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.processManualEntry();
        });
        
        // Export
        this.copyAllBtn.addEventListener('click', () => this.copyAllISBNs());
        this.emailBtn.addEventListener('click', () => this.emailList());
        this.exportCsvBtn.addEventListener('click', () => this.exportCSV());
        this.clearAllBtn.addEventListener('click', () => this.clearAllBooks());
        
        // Theme
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }
    
    // ==================== SCANNER METHODS ====================
    async startScanner() {
        try {
            this.scannerPlaceholder.style.display = 'none';
            this.scannerActive.style.display = 'block';
            this.updateScannerStatus('Checking native barcode support...');
            
            // Try native BarcodeDetector first
            if ('BarcodeDetector' in window) {
                await this.startNativeScanner();
            } else {
                await this.startHtml5QrScanner();
            }
            
            this.isScanning = true;
        } catch (error) {
            console.error('Scanner initialization failed:', error);
            this.updateScannerStatus('Falling back to HTML5 QR scanner...');
            await this.startHtml5QrScanner();
        }
    }
    
    async startNativeScanner() {
        this.updateScannerStatus('Starting native barcode detector...');
        this.currentScannerType = 'native';
        
        try {
            const barcodeDetector = new BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'isbn']
            });
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            
            // Display camera stream
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();
            this.cameraContainer.appendChild(video);
            
            // Continuous scanning
            const scanLoop = async () => {
                if (!this.isScanning) return;
                
                try {
                    const barcodes = await barcodeDetector.detect(video);
                    if (barcodes.length > 0) {
                        const isbn = barcodes[0].rawValue;
                        this.handleScannedISBN(isbn);
                        this.updateScannerStatus('Barcode detected!');
                        
                        // Pause briefly to prevent duplicate scans
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    // Ignore detection errors
                }
                
                requestAnimationFrame(scanLoop);
            };
            
            this.scanner = {
                type: 'native',
                stop: () => {
                    stream.getTracks().forEach(track => track.stop());
                    video.remove();
                }
            };
            
            scanLoop();
            this.updateScannerStatus('Scanner active - point at ISBN barcode');
            
        } catch (error) {
            console.error('Native scanner failed:', error);
            await this.startHtml5QrScanner();
        }
    }
    
    async startHtml5QrScanner() {
        this.updateScannerStatus('Starting HTML5 QR scanner...');
        this.currentScannerType = 'html5qrcode';
        
        try {
            if (typeof Html5Qrcode === 'undefined') {
                throw new Error('Html5Qrcode library not loaded');
            }
            
            this.scanner = new Html5Qrcode('cameraContainer');
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 150 },
                aspectRatio: 1.0,
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E
                ]
            };
            
            await this.scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    this.handleScannedISBN(decodedText);
                    this.updateScannerStatus('Barcode detected!');
                },
                (errorMessage) => {
                    // Scanning errors are normal
                }
            );
            
            this.updateScannerStatus('Scanner active - point at ISBN barcode');
            
        } catch (error) {
            console.error('HTML5 QR scanner failed:', error);
            this.updateScannerStatus('Scanner unavailable - use manual entry');
            this.showManualEntry();
        }
    }
    
    stopScanner() {
        if (this.scanner) {
            if (this.currentScannerType === 'native') {
                this.scanner.stop();
            } else if (this.currentScannerType === 'html5qrcode') {
                this.scanner.stop().then(() => {
                    this.scanner.clear();
                });
            }
            this.scanner = null;
        }
        
        this.isScanning = false;
        this.scannerActive.style.display = 'none';
        this.scannerPlaceholder.style.display = 'flex';
        
        // Clean up camera container
        this.cameraContainer.innerHTML = `
            <div class="scan-overlay">
                <div class="scan-corner top-left"></div>
                <div class="scan-corner top-right"></div>
                <div class="scan-corner bottom-left"></div>
                <div class="scan-corner bottom-right"></div>
                <div class="scan-line"></div>
            </div>
            <div class="scanner-status">
                <span id="scannerStatusText">Scanner stopped</span>
                <div id="scannerStatusDot" class="status-dot"></div>
            </div>
        `;
    }
    
    handleScannedISBN(isbn) {
        // Clean and validate ISBN
        const cleanedISBN = this.cleanISBN(isbn);
        
        if (!cleanedISBN) return;
        
        // Check for duplicates
        if (this.books.some(book => book.isbn === cleanedISBN)) {
            this.showToast('Book already scanned!');
            return;
        }
        
        // Add book to list
        const book = {
            isbn: cleanedISBN,
            title: '',
            author: '',
            cover: null,
            scannedAt: new Date().toISOString(),
            lookupStatus: 'pending'
        };
        
        this.books.push(book);
        this.saveBooks();
        this.renderBooks();
        
        // Start async lookup
        this.lookupBookDetails(cleanedISBN, this.books.length - 1);
        
        // Vibrate if supported
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
        
        // Play beep
        this.playBeep();
        
        this.showToast(`ISBN captured: ${cleanedISBN}`);
    }
    
    // ==================== BOOK LOOKUP ====================
    async lookupBookDetails(isbn, bookIndex) {
        const book = this.books[bookIndex];
        book.lookupStatus = 'loading';
        this.renderBooks();
        
        // Check cache first
        const cached = this.getFromCache(isbn);
        if (cached) {
            book.title = cached.title;
            book.author = cached.author;
            book.cover = cached.cover;
            book.lookupStatus = 'success';
            book.lookupSource = 'cache';
            this.saveBooks();
            this.renderBooks();
            return;
        }
        
        // Try each source in order
        for (const source of CONFIG.lookupSources) {
            try {
                const result = await this.fetchWithTimeout(
                    source.endpoint(isbn),
                    CONFIG.lookupTimeout
                );
                
                const parsed = source.parse(result);
                if (parsed && parsed.title) {
                    book.title = parsed.title;
                    book.author = parsed.author;
                    book.cover = parsed.cover;
                    book.lookupStatus = 'success';
                    book.lookupSource = source.name;
                    
                    // Save to cache
                    this.saveToCache(isbn, parsed);
                    
                    this.saveBooks();
                    this.renderBooks();
                    return;
                }
            } catch (error) {
                console.warn(`Lookup failed for ${source.name}:`, error);
                continue;
            }
        }
        
        // All sources failed
        book.lookupStatus = 'failed';
        book.title = 'Manual entry required';
        this.saveBooks();
        this.renderBooks();
    }
    
    async fetchWithTimeout(url, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    
    // ==================== CACHE MANAGEMENT ====================
    getFromCache(isbn) {
        try {
            const cache = JSON.parse(localStorage.getItem('bookCache') || '{}');
            const entry = cache[isbn];
            
            if (entry && entry.expires > Date.now()) {
                return entry.data;
            }
        } catch (error) {
            console.warn('Cache read failed:', error);
        }
        return null;
    }
    
    saveToCache(isbn, data) {
        try {
            const cache = JSON.parse(localStorage.getItem('bookCache') || '{}');
            cache[isbn] = {
                data: data,
                expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
            };
            localStorage.setItem('bookCache', JSON.stringify(cache));
        } catch (error) {
            console.warn('Cache save failed:', error);
        }
    }
    
    // ==================== ISBN PROCESSING ====================
    cleanISBN(input) {
        // Remove all non-numeric characters
        let cleaned = input.replace(/[^0-9X]/gi, '');
        
        // If it's an ISBN-10, convert to ISBN-13
        if (cleaned.length === 10) {
            cleaned = this.convertISBN10To13(cleaned);
        }
        
        // Validate ISBN-13
        if (cleaned.length === 13) {
            return cleaned;
        }
        
        return null;
    }
    
    convertISBN10To13(isbn10) {
        // Prefix with 978 and recalculate check digit
        const base = '978' + isbn10.substring(0, 9);
        let sum = 0;
        
        for (let i = 0; i < 12; i++) {
            sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
        }
        
        const checkDigit = (10 - (sum % 10)) % 10;
        return base + checkDigit;
    }
    
    // ==================== UI METHODS ====================
    renderBooks() {
        this.booksList.innerHTML = '';
        
        if (this.books.length === 0) {
            this.booksList.appendChild(this.emptyState);
            this.bookCount.textContent = '0 books';
            this.updateExportButtons();
            return;
        }
        
        this.books.forEach((book, index) => {
            const bookElement = this.createBookElement(book, index);
            this.booksList.appendChild(bookElement);
        });
        
        this.bookCount.textContent = `${this.books.length} books`;
        this.clearAllBtn.style.display = 'inline-flex';
        this.updateExportButtons();
    }
    
    createBookElement(book, index) {
        const div = document.createElement('div');
        div.className = 'book-item';
        
        const lookupIcon = this.getLookupIcon(book.lookupStatus);
        
        div.innerHTML = `
            <div class="book-info">
                <div class="book-isbn">${book.isbn}</div>
                <div class="book-title">
                    ${book.title || 'Looking up...'}
                    ${book.lookupSource ? `<span style="font-size: 0.75rem; color: var(--text-secondary)">via ${book.lookupSource}</span>` : ''}
                </div>
                ${book.author ? `<div style="font-size: 0.875rem; color: var(--text-secondary)">${book.author}</div>` : ''}
            </div>
            <div class="book-actions">
                <button class="icon-btn-sm" onclick="app.copyISBN('${book.isbn}')" title="Copy ISBN">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 2a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V2z"/>
                        <path d="M2 6a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-1"/>
                    </svg>
                </button>
                <button class="icon-btn-sm" onclick="app.removeBook(${index})" title="Remove">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `;
        
        return div;
    }
    
    getLookupIcon(status) {
        switch(status) {
            case 'loading':
                return '<span style="color: var(--warning)">⟳</span>';
            case 'success':
                return '<span style="color: var(--success)">✓</span>';
            case 'failed':
                return '<span style="color: var(--danger)">!</span>';
            default:
                return '';
        }
    }
    
    updateScannerStatus(message) {
        this.scannerStatusText.textContent = message;
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
            this.showToast(`ISBN copied: ${isbn}`);
        } catch (error) {
            console.error('Copy failed:', error);
            this.showToast('Failed to copy ISBN');
        }
    }
    
    async copyAllISBNs() {
        if (this.books.length === 0) return;
        
        const isbns = this.books.map(book => book.isbn).join('\n');
        
        try {
            await navigator.clipboard.writeText(isbns);
            this.showToast(`Copied ${this.books.length} ISBNs to clipboard!`);
        } catch (error) {
            console.error('Copy failed:', error);
            
            // Fallback: Show textarea for manual copy
            const fallbackText = prompt('Copy these ISBNs:', isbns);
        }
    }
    
    emailList() {
        if (this.books.length === 0) return;
        
        const subject = encodeURIComponent('My Book List for Office Library');
        const body = encodeURIComponent(
            this.books.map(book => 
                `${book.isbn}${book.title ? ` - ${book.title}` : ''}`
            ).join('\n')
        );
        
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
    
    exportCSV() {
        if (this.books.length === 0) return;
        
        const csv = [
            'ISBN,Title,Author',
            ...this.books.map(book => 
                `${book.isbn},${book.title || ''},${book.author || ''}`
            )
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scanned-books.csv';
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('CSV exported!');
    }
    
    removeBook(index) {
        this.books.splice(index, 1);
        this.saveBooks();
        this.renderBooks();
        this.showToast('Book removed');
    }
    
    clearAllBooks() {
        if (confirm('Clear all scanned books?')) {
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
        try {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.books));
        } catch (error) {
            console.warn('Save failed:', error);
        }
    }
    
    loadBooks() {
        try {
            const stored = localStorage.getItem(CONFIG.storageKey);
            if (stored) {
                this.books = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Load failed:', error);
            this.books = [];
        }
        
        this.renderBooks();
    }
    
    // ==================== THEME MANAGEMENT ====================
    loadTheme() {
        const theme = localStorage.getItem(CONFIG.themeKey) || 'light';
        document.documentElement.setAttribute('data-theme', theme);
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(CONFIG.themeKey, newTheme);
    }
    
    // ==================== UTILITIES ====================
    checkScannerSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.startScanBtn.textContent = 'Scanner Not Supported';
            this.startScanBtn.disabled = true;
            this.scannerPlaceholder.querySelector('p').textContent = 
                'Camera not supported in this browser. Use manual entry.';
        }
    }
    
    playBeep() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            console.warn('Audio not available:', error);
        }
    }
    
    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.toast.classList.remove('show');
        }, 2000);
    }
}

// ==================== INITIALIZE APP ====================
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new BookScannerApp();
});

// Expose app globally for onclick handlers
window.app = app;
