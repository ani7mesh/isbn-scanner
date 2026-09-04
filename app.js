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
            name: 'Open Library Covers',
            endpoint: (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.json`,
            parse: (data) => {
                if (data && data.title) {
                    return {
                        title: data.title,
                        author: data.authors ? data.authors[0].name : 'Unknown Author',
                        cover: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`
                    };
                }
                return null;
            }
        },
        {
            name: 'Library of Congress',
            endpoint: (isbn) => `https://www.loc.gov/books/?q=${isbn}&fo=json`,
            parse: (data) => {
                if (data.results && data.results.length > 0) {
                    const book = data.results[0];
                    return {
                        title: book.title || 'Unknown Title',
                        author: book.contributors ? book.contributors[0] : 'Unknown Author',
                        cover: book.image_url ? book.image_url[0] : null
                    };
                }
                return null;
            }
        }
    ],
    
    // Scanner fallback order
    scannerPriority: ['native', 'html5qrcode', 'manual'],
    
    // Timeouts
    lookupTimeout: 8000,
    
    // Storage
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
        this.currentScannerType = null;
        this.lookupQueue = [];
        this.isProcessingQueue = false;
        
        this.initializeElements();
        this.loadBooks();
        this.loadTheme();
        this.bindEvents();
        this.checkScannerSupport();
        
        console.log('Book Scanner App initialized');
        console.log('Loaded books:', this.books.length);
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
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + M for manual entry
            if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                e.preventDefault();
                this.showManualEntry();
            }
            // Ctrl/Cmd + C to copy all when no text selected
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this.books.length > 0) {
                const selection = window.getSelection();
                if (!selection || selection.toString().length === 0) {
                    e.preventDefault();
                    this.copyAllISBNs();
                }
            }
        });
    }
    
    // ==================== SCANNER METHODS ====================
    async startScanner() {
        console.log('Starting scanner...');
        
        try {
            this.scannerPlaceholder.style.display = 'none';
            this.scannerActive.style.display = 'block';
            this.updateScannerStatus('Checking native barcode support...');
            
            // Try native BarcodeDetector first
            if ('BarcodeDetector' in window) {
                console.log('Native BarcodeDetector available');
                await this.startNativeScanner();
            } else {
                console.log('Native BarcodeDetector not available, using HTML5-QRCode');
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
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']
            });
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            // Display camera stream
            const video = document.createElement('video');
            video.srcObject = stream;
            video.setAttribute('playsinline', '');
            video.play();
            
            // Clear previous content
            this.cameraContainer.innerHTML = '';
            this.cameraContainer.appendChild(video);
            
            // Add overlay elements
            this.cameraContainer.innerHTML += `
                <div class="scan-overlay">
                    <div class="scan-corner top-left"></div>
                    <div class="scan-corner top-right"></div>
                    <div class="scan-corner bottom-left"></div>
                    <div class="scan-corner bottom-right"></div>
                    <div class="scan-line"></div>
                </div>
                <div class="scanner-status">
                    <span id="scannerStatusText">${this.scannerStatusText.textContent}</span>
                    <div class="status-dot"></div>
                </div>
            `;
            
            // Continuous scanning
            let lastDetectedBarcode = '';
            let lastDetectionTime = 0;
            
            const scanLoop = async () => {
                if (!this.isScanning) return;
                
                try {
                    const barcodes = await barcodeDetector.detect(video);
                    if (barcodes.length > 0) {
                        const rawValue = barcodes[0].rawValue;
                        console.log('Native scanner detected:', rawValue);
                        
                        // Prevent duplicate rapid scans
                        const now = Date.now();
                        if (rawValue !== lastDetectedBarcode || now - lastDetectionTime > 2000) {
                            lastDetectedBarcode = rawValue;
                            lastDetectionTime = now;
                            this.handleScannedISBN(rawValue);
                        }
                    }
                } catch (error) {
                    // Ignore detection errors
                }
                
                if (this.isScanning) {
                    requestAnimationFrame(scanLoop);
                }
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
            console.log('Native scanner started successfully');
            
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
            
            // Clear previous content
            this.cameraContainer.innerHTML = '';
            
            this.scanner = new Html5Qrcode('cameraContainer');
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 150 },
                aspectRatio: 1.0,
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.ITF
                ]
            };
            
            await this.scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    console.log('HTML5-QR scanner detected:', decodedText);
                    this.handleScannedISBN(decodedText);
                },
                (errorMessage) => {
                    // Scanning errors are normal
                }
            );
            
            this.updateScannerStatus('Scanner active - point at ISBN barcode');
            console.log('HTML5-QR scanner started successfully');
            
        } catch (error) {
            console.error('HTML5 QR scanner failed:', error);
            this.updateScannerStatus('Scanner unavailable - use manual entry');
            this.showManualEntry();
        }
    }
    
    stopScanner() {
        console.log('Stopping scanner...');
        
        if (this.scanner) {
            if (this.currentScannerType === 'native') {
                this.scanner.stop();
            } else if (this.currentScannerType === 'html5qrcode') {
                this.scanner.stop().then(() => {
                    this.scanner.clear();
                }).catch(err => {
                    console.warn('Scanner stop error:', err);
                });
            }
            this.scanner = null;
        }
        
        this.isScanning = false;
        this.scannerActive.style.display = 'none';
        this.scannerPlaceholder.style.display = 'flex';
        
        console.log('Scanner stopped');
    }
    
    handleScannedISBN(rawValue) {
        console.log('Processing scanned value:', rawValue);
        
        // Clean and validate ISBN
        const cleanedISBN = this.cleanISBN(rawValue);
        
        if (!cleanedISBN) {
            console.warn('Invalid ISBN format:', rawValue);
            this.showToast('Invalid ISBN detected');
            return;
        }
        
        console.log('Cleaned ISBN:', cleanedISBN);
        
        // Check for duplicates
        if (this.books.some(book => book.isbn === cleanedISBN)) {
            console.log('Duplicate ISBN detected:', cleanedISBN);
            this.showToast('Book already scanned!');
            return;
        }
        
        // Add book to list
        const book = {
            isbn: cleanedISBN,
            isbnOriginal: rawValue,
            title: '',
            author: '',
            cover: null,
            scannedAt: new Date().toISOString(),
            lookupStatus: 'pending'
        };
        
        this.books.push(book);
        this.saveBooks();
        this.renderBooks();
        
        // Queue lookup
        this.queueLookup(cleanedISBN, this.books.length - 1);
        
        // Vibrate if supported
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
        
        // Play beep
        this.playBeep();
        
        this.showToast(`ISBN captured: ${cleanedISBN}`);
    }
    
    // ==================== BOOK LOOKUP ====================
    queueLookup(isbn, bookIndex) {
        this.lookupQueue.push({ isbn, bookIndex });
        this.processLookupQueue();
    }
    
    async processLookupQueue() {
        if (this.isProcessingQueue || this.lookupQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        while (this.lookupQueue.length > 0) {
            const { isbn, bookIndex } = this.lookupQueue.shift();
            await this.lookupBookDetails(isbn, bookIndex);
        }
        
        this.isProcessingQueue = false;
    }
    
    async lookupBookDetails(isbn, bookIndex) {
        const book = this.books[bookIndex];
        if (!book) return;
        
        book.lookupStatus = 'loading';
        this.renderBooks();
        
        // Check cache first
        const cached = this.getFromCache(isbn);
        if (cached) {
            console.log(`Cache hit for ${isbn}`);
            book.title = cached.title;
            book.author = cached.author;
            book.cover = cached.cover;
            book.lookupStatus = 'success';
            book.lookupSource = 'cache';
            this.saveBooks();
            this.renderBooks();
            return;
        }
        
        console.log(`Looking up ISBN: ${isbn}`);
        
        // Try each source in order
        for (const source of CONFIG.lookupSources) {
            try {
                console.log(`Trying ${source.name}...`);
                
                const result = await this.fetchWithTimeout(
                    source.endpoint(isbn),
                    CONFIG.lookupTimeout
                );
                
                const parsed = source.parse(result);
                if (parsed && parsed.title && parsed.title !== 'Unknown Title') {
                    console.log(`Success with ${source.name}:`, parsed.title);
                    
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
                console.warn(`Lookup failed for ${source.name}:`, error.message || error);
                continue;
            }
        }
        
        // All sources failed
        console.warn(`All lookup sources failed for ${isbn}`);
        book.lookupStatus = 'failed';
        book.title = 'Manual entry required';
        this.saveBooks();
        this.renderBooks();
    }
    
    async fetchWithTimeout(url, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, { 
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    
    // ==================== CACHE MANAGEMENT ====================
    getFromCache(isbn) {
        try {
            const cache = JSON.parse(localStorage.getItem(CONFIG.cacheKey) || '{}');
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
            const cache = JSON.parse(localStorage.getItem(CONFIG.cacheKey) || '{}');
            cache[isbn] = {
                data: data,
                expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
            };
            localStorage.setItem(CONFIG.cacheKey, JSON.stringify(cache));
        } catch (error) {
            console.warn('Cache save failed:', error);
        }
    }
    
    // ==================== ISBN PROCESSING ====================
    cleanISBN(input) {
        console.log('Cleaning ISBN input:', input);
        
        // Convert to string if needed
        let cleaned = String(input).trim();
        
        // Remove common prefixes
        cleaned = cleaned.replace(/^ISBN[-: ]*/i, '');
        
        // Remove all non-alphanumeric characters except X
        cleaned = cleaned.replace(/[^0-9X]/gi, '').toUpperCase();
        
        console.log('After cleaning:', cleaned);
        
        // Handle different ISBN formats
        if (cleaned.length === 13) {
            // ISBN-13 - validate check digit
            if (this.validateISBN13(cleaned)) {
                return cleaned;
            } else {
                // Try to fix check digit
                const fixed = this.fixISBN13CheckDigit(cleaned);
                if (fixed && this.validateISBN13(fixed)) {
                    console.log('Fixed invalid check digit:', fixed);
                    return fixed;
                }
            }
        } else if (cleaned.length === 10) {
            // ISBN-10 - convert to ISBN-13
            const converted = this.convertISBN10To13(cleaned);
            if (converted && this.validateISBN13(converted)) {
                console.log('Converted ISBN-10 to ISBN-13:', converted);
                return converted;
            }
        } else if (cleaned.length === 12) {
            // Might be UPC-A or EAN without check digit
            // Try adding leading 978 for book barcodes
            if (cleaned.startsWith('978') || cleaned.startsWith('979')) {
                // Add check digit
                const withCheck = this.addISBN13CheckDigit(cleaned);
                if (this.validateISBN13(withCheck)) {
                    return withCheck;
                }
            } else {
                // Add 978 prefix and check digit
                const withPrefix = '978' + cleaned;
                const withCheck = this.addISBN13CheckDigit(withPrefix);
                if (this.validateISBN13(withCheck)) {
                    return withCheck;
                }
            }
        } else if (cleaned.length > 13) {
            // Look for ISBN pattern in longer string
            const matches = cleaned.match(/(?:978|979)\d{10}/);
            if (matches && this.validateISBN13(matches[0])) {
                console.log('Extracted ISBN from longer string:', matches[0]);
                return matches[0];
            }
        }
        
        console.warn('Could not parse valid ISBN from:', input);
        return null;
    }
    
    validateISBN13(isbn) {
        if (isbn.length !== 13) return false;
        
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(isbn[i]) * (i % 2 === 0 ? 1 : 3);
        }
        
        const checkDigit = (10 - (sum % 10)) % 10;
        return checkDigit === parseInt(isbn[12]);
    }
    
    fixISBN13CheckDigit(isbn) {
        if (isbn.length !== 13) return null;
        
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(isbn[i]) * (i % 2 === 0 ? 1 : 3);
        }
        
        const checkDigit = (10 - (sum % 10)) % 10;
        return isbn.substring(0, 12) + checkDigit;
    }
    
    addISBN13CheckDigit(isbn) {
        if (isbn.length !== 12) return null;
        
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(isbn[i]) * (i % 2 === 0 ? 1 : 3);
        }
        
        const checkDigit = (10 - (sum % 10)) % 10;
        return isbn + checkDigit;
    }
    
    convertISBN10To13(isbn10) {
        if (isbn10.length !== 10) return null;
        
        // Validate ISBN-10
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(isbn10[i]) * (10 - i);
        }
        
        const lastChar = isbn10[9];
        const lastDigit = lastChar === 'X' ? 10 : parseInt(lastChar);
        sum += lastDigit;
        
        if (sum % 11 !== 0) {
            console.warn('Invalid ISBN-10 checksum');
            return null;
        }
        
        // Convert to ISBN-13
        const base = '978' + isbn10.substring(0, 9);
        return this.addISBN13CheckDigit(base);
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
        div.id = `book-${index}`;
        
        const statusIcon = this.getStatusIcon(book.lookupStatus);
        const titleDisplay = book.title || 'Looking up...';
        
        div.innerHTML = `
            <div class="book-info">
                <div class="book-isbn">
                    ${book.isbn}
                    ${book.isbnOriginal !== book.isbn ? `<span style="font-size: 0.75rem; opacity: 0.7;">(from: ${book.isbnOriginal})</span>` : ''}
                </div>
                <div class="book-title">
                    ${statusIcon} ${titleDisplay}
                    ${book.lookupSource && book.lookupStatus === 'success' ? 
                        `<span style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 0.5rem;">via ${book.lookupSource}</span>` : ''}
                </div>
                ${book.author ? `<div style="font-size: 0.875rem; color: var(--text-secondary);">${book.author}</div>` : ''}
                ${book.lookupStatus === 'failed' ? 
                    `<div style="font-size: 0.75rem; color: var(--danger); margin-top: 0.25rem;">
                        ⚠️ Could not fetch details. You can manually edit or leave as is.
                    </div>` : ''}
            </div>
            <div class="book-actions">
                <button class="icon-btn-sm" onclick="app.copyISBN('${book.isbn}')" title="Copy ISBN">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 2a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V2z"/>
                        <path d="M2 6a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-1"/>
                    </svg>
                </button>
                <button class="icon-btn-sm" onclick="app.editBook(${index})" title="Edit">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.5 1.5l3 3L5 14l-3.5.5L2 11 11.5 1.5z"/>
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
    
    getStatusIcon(status) {
        switch(status) {
            case 'loading':
                return '<span style="color: var(--warning);">⟳</span>';
            case 'success':
                return '<span style="color: var(--success);">✓</span>';
            case 'failed':
                return '<span style="color: var(--danger);">!</span>';
            case 'pending':
                return '<span style="color: var(--text-secondary);">•</span>';
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
            console.log('Manual entry:', isbn);
            this.handleScannedISBN(isbn);
            this.hideManualEntry();
        }
    }
    
    async copyISBN(isbn) {
        try {
            await navigator.clipboard.writeText(isbn);
            this.showToast(`ISBN copied: ${isbn}`);
            console.log('Copied ISBN:', isbn);
        } catch (error) {
            console.error('Copy failed:', error);
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = isbn;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast(`ISBN copied: ${isbn}`);
        }
    }
    
    async copyAllISBNs() {
        if (this.books.length === 0) return;
        
        const isbns = this.books.map(book => book.isbn).join('\n');
        
        try {
            await navigator.clipboard.writeText(isbns);
            this.showToast(`Copied ${this.books.length} ISBNs to clipboard!`);
            console.log('Copied all ISBNs:', isbns);
        } catch (error) {
            console.error('Copy failed:', error);
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = isbns;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast(`Copied ${this.books.length} ISBNs to clipboard!`);
        }
    }
    
    emailList() {
        if (this.books.length === 0) return;
        
        const subject = encodeURIComponent('My Book List for Office Library');
        const body = encodeURIComponent(
            this.books.map((book, index) => 
                `${index + 1}. ${book.isbn}${book.title ? ` - ${book.title}` : ''}`
            ).join('\n')
        );
        
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
        console.log('Email client opened with book list');
    }
    
    exportCSV() {
        if (this.books.length === 0) return;
        
        const csv = [
            'ISBN,Title,Author,Scanned At',
            ...this.books.map(book => 
                `"${book.isbn}","${book.title || ''}","${book.author || ''}","${book.scannedAt || ''}"`
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
        console.log('CSV exported with', this.books.length, 'books');
    }
    
    editBook(index) {
        const book = this.books[index];
        if (!book) return;
        
        const newTitle = prompt('Enter book title:', book.title);
        if (newTitle !== null) {
            book.title = newTitle;
            book.lookupStatus = 'success';
            book.lookupSource = 'manual';
            
            const newAuthor = prompt('Enter book author:', book.author);
            if (newAuthor !== null) {
                book.author = newAuthor;
            }
            
            this.saveBooks();
            this.renderBooks();
            this.showToast('Book details updated');
        }
    }
    
    removeBook(index) {
        this.books.splice(index, 1);
        this.saveBooks();
        this.renderBooks();
        this.showToast('Book removed');
        console.log('Removed book at index:', index);
    }
    
    clearAllBooks() {
        if (this.books.length === 0) return;
        
        if (confirm('Clear all scanned books? This cannot be undone.')) {
            this.books = [];
            this.saveBooks();
            this.renderBooks();
            this.showToast('All books cleared');
            console.log('All books cleared');
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
            console.log('Saved', this.books.length, 'books to localStorage');
        } catch (error) {
            console.warn('Save failed:', error);
            this.showToast('Failed to save books');
        }
    }
    
    loadBooks() {
        try {
            const stored = localStorage.getItem(CONFIG.storageKey);
            if (stored) {
                this.books = JSON.parse(stored);
                console.log('Loaded', this.books.length, 'books from localStorage');
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
        console.log('Theme changed to:', newTheme);
    }
    
    // ==================== UTILITIES ====================
    checkScannerSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.startScanBtn.textContent = 'Scanner Not Supported';
            this.startScanBtn.disabled = true;
            this.scannerPlaceholder.querySelector('p').textContent = 
                'Camera not supported in this browser. Use manual entry.';
            console.warn('Camera not supported');
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
    
    // Add service worker registration for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    }
});

// Expose app globally for onclick handlers
window.app = app;

// ==================== SERVICE WORKER (for PWA) ====================
// Save this as sw.js in the same directory
/*
const CACHE_NAME = 'isbn-scanner-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
*/