// ============================================================
// THALASSA RECEIPTS — APPLICATION LOGIC
// Gestor Inteligente de Facturas con IA (Gemini Vision)
// ============================================================

// ── CONSTANTS ──────────────────────────────────────────────
const STORAGE_KEY = 'thalassa_receipts_data';
const API_KEY_STORAGE = 'thalassa_gemini_api_key';
const PIN_HASH_STORAGE = 'thalassa_pin_hash';
const SESSION_KEY = 'thalassa_session_active';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ── FIREBASE CONFIGURATION ─────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAX3earAFu2F2RMDR-4FnE64rvQqcUZbc4",
  authDomain: "tablerofacturasline.firebaseapp.com",
  projectId: "tablerofacturasline",
  storageBucket: "tablerofacturasline.firebasestorage.app",
  messagingSenderId: "658530188422",
  appId: "1:658530188422:web:1c5dda3b3390f4aaa42507",
  measurementId: "G-YZ16RWXWZB"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ── STATE ──────────────────────────────────────────────────
let receipts = [];
let currentUserUid = null;
let productCategories = {}; // { "product name": "peluqueria" | "estetica" | "general" }
let currentEditId = null; // for detail modal delete
let extractedData = null; // temp data from AI scan

// Currency formatter
const currency = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
});

const shortDate = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
});

// ── DOM REFERENCES ─────────────────────────────────────────
const DOM = {
    // Sidebar & nav
    sidebar: document.getElementById('sidebar'),
    mobileBurger: document.getElementById('mobile-burger'),
    mobileOverlay: document.getElementById('mobile-overlay'),
    navItems: document.querySelectorAll('.nav-item[data-section]'),
    sections: document.querySelectorAll('.section'),

    // Dashboard
    kpiMonthlySpend: document.getElementById('kpi-monthly-spend'),
    kpiMonthlyCount: document.getElementById('kpi-monthly-count'),
    kpiAvgReceipt: document.getElementById('kpi-avg-receipt'),
    kpiTopStore: document.getElementById('kpi-top-store'),
    dashboardRecent: document.getElementById('dashboard-recent-receipts'),
    apiKeyBanner: document.getElementById('api-key-banner'),
    btnGoSettings: document.getElementById('btn-go-settings'),

    // Receipts section
    receiptsList: document.getElementById('receipts-list'),
    searchReceipts: document.getElementById('search-receipts'),
    filterStore: document.getElementById('filter-store'),
    filterMonth: document.getElementById('filter-month'),

    // Shopping list
    shoppingList: document.getElementById('shopping-list'),
    shoppingMonth: document.getElementById('shopping-month'),

    // Products
    navProducts: document.getElementById('nav-products'),
    sectionProducts: document.getElementById('section-products'),
    productsMonth: document.getElementById('products-month'),
    productsCategorySummary: document.getElementById('products-category-summary'),
    productsCategorizationBody: document.getElementById('products-categorization-body'),

    // Reports
    reportsMonth: document.getElementById('reports-month'),
    reportsSummary: document.getElementById('reports-summary'),
    barsByStore: document.getElementById('bars-by-store'),
    barsTopProducts: document.getElementById('bars-top-products'),
    barsFrequency: document.getElementById('bars-frequency'),

    // Settings
    settingsApiKey: document.getElementById('settings-api-key'),
    btnSaveApiKey: document.getElementById('btn-save-api-key'),
    apiKeyStatus: document.getElementById('api-key-status'),
    btnSettingsExport: document.getElementById('btn-settings-export'),
    btnSettingsImport: document.getElementById('btn-settings-import'),
    fileImport: document.getElementById('file-import'),
    btnClearData: document.getElementById('btn-clear-data'),

    // Scan modal
    modalScan: document.getElementById('modal-scan'),
    uploadZone: document.getElementById('upload-zone'),
    receiptFileInput: document.getElementById('receipt-file-input'),
    uploadPreview: document.getElementById('upload-preview'),
    btnProcessScan: document.getElementById('btn-process-scan'),
    scanUploadState: document.getElementById('scan-upload-state'),
    scanLoadingState: document.getElementById('scan-loading-state'),

    // Review modal
    modalReview: document.getElementById('modal-review'),
    reviewStore: document.getElementById('review-store'),
    reviewDate: document.getElementById('review-date'),
    reviewProductsBody: document.getElementById('review-products-body'),
    reviewTotal: document.getElementById('review-total'),
    reviewNotes: document.getElementById('review-notes'),
    btnAddProductRow: document.getElementById('btn-add-product-row'),
    btnSaveReceipt: document.getElementById('btn-save-receipt'),

    // Detail modal
    modalDetail: document.getElementById('modal-detail'),
    detailTitle: document.getElementById('detail-title'),
    detailBody: document.getElementById('detail-body'),
    btnDeleteReceipt: document.getElementById('btn-delete-receipt'),

    // Toast
    toastContainer: document.getElementById('toast-container'),

    // Scan buttons (multiple entry points)
    btnScanDashboard: document.getElementById('btn-scan-dashboard'),
    btnScanReceipts: document.getElementById('btn-scan-receipts'),
    btnScanSidebar: document.getElementById('btn-scan-sidebar'),
    btnExportData: document.getElementById('btn-export-data'),
};

// ── PERSISTENCE ────────────────────────────────────────────

// Sanitize a receipt to ensure all fields have correct types
function sanitizeReceipt(r) {
    if (!r || typeof r !== 'object') return null;

    // Ensure total is a number
    if (typeof r.total !== 'number' || isNaN(r.total)) {
        r.total = parseFloat(r.total) || 0;
    }

    // Validate/fix date format to YYYY-MM-DD
    if (r.date && !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
        try {
            // Handle DD/MM/YYYY, DD-MM-YYYY and other formats
            let parsed;
            const slashParts = r.date.split('/');
            const dashParts = r.date.split('-');
            if (slashParts.length === 3 && slashParts[0].length <= 2) {
                // DD/MM/YYYY format
                parsed = new Date(+slashParts[2], +slashParts[1] - 1, +slashParts[0]);
            } else if (dashParts.length === 3 && dashParts[0].length <= 2) {
                // DD-MM-YYYY format
                parsed = new Date(+dashParts[2], +dashParts[1] - 1, +dashParts[0]);
            } else {
                parsed = new Date(r.date);
            }
            if (!isNaN(parsed.getTime())) {
                r.date = parsed.toISOString().split('T')[0];
            } else {
                r.date = new Date().toISOString().split('T')[0];
            }
        } catch {
            r.date = new Date().toISOString().split('T')[0];
        }
    }
    if (!r.date) {
        r.date = new Date().toISOString().split('T')[0];
    }

    // Ensure ID exists
    if (!r.id) r.id = generateId();

    // Validate products array
    if (Array.isArray(r.products)) {
        r.products.forEach(p => {
            p.qty = (typeof p.qty === 'number' && !isNaN(p.qty)) ? p.qty : (parseInt(p.qty) || 1);
            p.unitPrice = (typeof p.unitPrice === 'number' && !isNaN(p.unitPrice)) ? p.unitPrice : (parseFloat(p.unitPrice) || 0);
            p.totalPrice = (typeof p.totalPrice === 'number' && !isNaN(p.totalPrice)) ? p.totalPrice : (parseFloat(p.totalPrice) || 0);
            p.name = String(p.name || 'Producto');
        });
    } else {
        r.products = [];
    }

    return r;
}

// Save a receipt image to Firebase Storage and return URL
async function saveReceiptImage(receiptId, fileOrBase64) {
    if (!fileOrBase64 || !receiptId) return null;
    try {
        const storageRef = storage.ref(`users/${currentUserUid}/receipts/${receiptId}`);
        let uploadTask;
        
        if (typeof fileOrBase64 === 'string' && fileOrBase64.startsWith('data:image')) {
            uploadTask = await storageRef.putString(fileOrBase64, 'data_url');
        } else {
            uploadTask = await storageRef.put(fileOrBase64);
        }
        
        const downloadURL = await uploadTask.ref.getDownloadURL();
        return downloadURL;
    } catch (e) {
        console.error('Error saving receipt image to Firebase:', e);
        return null;
    }
}

// Retrieve a receipt image URL
async function getReceiptImage(receiptId) {
    try {
        const storageRef = storage.ref(`users/${currentUserUid}/receipts/${receiptId}`);
        return await storageRef.getDownloadURL();
    } catch (e) {
        console.warn('Error loading receipt image from Firebase:', e);
        return null;
    }
}

// Remove a receipt image from Firebase Storage
async function deleteReceiptImage(receiptId) {
    try {
        const storageRef = storage.ref(`users/${currentUserUid}/receipts/${receiptId}`);
        await storageRef.delete();
    } catch (e) {
        console.warn('Error deleting receipt image from Firebase:', e);
    }
}

async function loadProductCategories() {
    try {
        const doc = await db.collection('users').doc(currentUserUid).collection('settings').doc('productCategories').get();
        if (doc.exists) {
            productCategories = doc.data() || {};
        } else {
            productCategories = {};
        }
    } catch (e) {
        console.error('Error loading product categories from Firebase:', e);
        productCategories = {};
    }
}

async function saveProductCategories() {
    try {
        await db.collection('users').doc(currentUserUid).collection('settings').doc('productCategories').set(productCategories);
    } catch (e) {
        console.error('Error saving product categories to Firebase:', e);
    }
}

async function migrateGlobalToPrivate(uid) {
    try {
        const globalRef = db.collection('receipts');
        const snapshot = await globalRef.get();
        
        if (!snapshot.empty) {
            console.log('Migrating global data to private account...');
            showToast('Sincronizando cuenta...', 'info');
            
            // Migrate receipts
            for (const doc of snapshot.docs) {
                const data = doc.data();
                await db.collection('users').doc(uid).collection('receipts').doc(doc.id).set(data);
                // After copying, delete from global to avoid re-migrating
                await globalRef.doc(doc.id).delete();
            }
            
            // Migrate categories
            const catDoc = await db.collection('settings').doc('productCategories').get();
            if (catDoc.exists) {
                await db.collection('users').doc(uid).collection('settings').doc('productCategories').set(catDoc.data());
                await db.collection('settings').doc('productCategories').delete();
            }
            
            console.log('Migration to private account complete.');
            showToast('Cuenta configurada', 'success');
        }
    } catch (e) {
        console.error('Error during global migration:', e);
    }
}

let renderTimeout;

async function loadReceipts() {
    try {
        await loadProductCategories();
        
        // Start migration in background (do not await)
        migrateGlobalToPrivate(currentUserUid).catch(e => console.error('Migration failed:', e));
        
        // Use onSnapshot to get real-time updates from other devices!
        db.collection('users').doc(currentUserUid).collection('receipts').onSnapshot(snapshot => {
            receipts = [];
            snapshot.forEach(doc => {
                receipts.push(sanitizeReceipt(doc.data()));
            });
            receipts.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Debounce rendering to avoid UI freezing during mass imports/migrations
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => {
                renderDashboard();
                renderReceiptsList();
            }, 150);
        });

    } catch (e) {
        console.error('Error loading receipts from Firebase:', e);
        showToast('Error de conexión con la base de datos', 'error');
    }
}

async function saveReceipts() {
    // Deprecated. We save individual documents to Firebase now.
}

let currentApiKey = '';

function getApiKey() {
    return currentApiKey || localStorage.getItem(API_KEY_STORAGE) || '';
}

async function setApiKey(key) {
    key = key.trim();
    currentApiKey = key;
    localStorage.setItem(API_KEY_STORAGE, key);
    if (currentUserUid) {
        try {
            await db.collection('users').doc(currentUserUid).collection('settings').doc('apiKey').set({ value: key });
        } catch (e) {
            console.error('Error saving API Key to Firebase:', e);
        }
    }
}

async function loadApiKey() {
    if (!currentUserUid) return;
    try {
        const doc = await db.collection('users').doc(currentUserUid).collection('settings').doc('apiKey').get();
        if (doc.exists && doc.data().value) {
            const key = doc.data().value;
            currentApiKey = key;
            localStorage.setItem(API_KEY_STORAGE, key);
            updateApiKeyStatus();
        }
    } catch (e) {
        console.error('Error loading API Key from Firebase:', e);
    }
}

// ── TOASTS ─────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    };

    toast.innerHTML = `${icons[type] || icons.info} <span>${message}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ── NAVIGATION ─────────────────────────────────────────────

function navigateTo(sectionId) {
    // Update nav items
    DOM.navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });

    // Show/hide sections
    DOM.sections.forEach(sec => {
        sec.classList.toggle('active', sec.id === `section-${sectionId}`);
    });

    // Close mobile sidebar
    DOM.sidebar.classList.remove('open');
    DOM.mobileOverlay.classList.remove('open');

    // Render section-specific content
    switch (sectionId) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'receipts':
            renderReceiptsList();
            break;
        case 'shopping':
            renderShoppingList();
            break;
        case 'products':
            renderProductsSection();
            break;
        case 'reports':
            renderReports();
            break;
        case 'settings':
            renderSettings();
            break;
    }
}

// ── HELPERS ────────────────────────────────────────────────

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthReceipts(monthStr) {
    if (!monthStr) monthStr = getCurrentMonth();
    return receipts.filter(r => r.date && r.date.startsWith(monthStr));
}

function getStoreInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
}

function generateId() {
    return 'inv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
}

function formatDateStr(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr + 'T00:00:00');
        return shortDate.format(d);
    } catch {
        return dateStr;
    }
}

// ── DASHBOARD ──────────────────────────────────────────────

function renderDashboard() {
    const month = getCurrentMonth();
    const monthReceipts = getMonthReceipts(month);

    // KPIs
    const totalSpend = monthReceipts.reduce((s, r) => s + (r.total || 0), 0);
    const count = monthReceipts.length;
    const avg = count > 0 ? totalSpend / count : 0;

    DOM.kpiMonthlySpend.textContent = currency.format(totalSpend);
    DOM.kpiMonthlyCount.textContent = count;
    DOM.kpiAvgReceipt.textContent = currency.format(avg);

    // Top store
    const storeCounts = {};
    monthReceipts.forEach(r => {
        const s = (r.store || 'Desconocido');
        storeCounts[s] = (storeCounts[s] || 0) + 1;
    });
    const topStore = Object.entries(storeCounts).sort((a, b) => b[1] - a[1])[0];
    DOM.kpiTopStore.textContent = topStore ? topStore[0] : '—';

    // API key banner
    DOM.apiKeyBanner.classList.toggle('hidden', !!getApiKey());

    // Fiscal Summary Update
    if (typeof renderFiscalSummary === 'function') {
        renderFiscalSummary();
    }

    // Recent receipts (last 5)
    const sorted = [...receipts].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = sorted.slice(0, 5);

    if (recent.length === 0) {
        DOM.dashboardRecent.innerHTML = renderEmptyState(
            'No hay facturas aún',
            'Escanea tu primer ticket de compra para empezar a registrar tus gastos.'
        );
        return;
    }

    DOM.dashboardRecent.innerHTML = recent.map(r => renderReceiptCard(r)).join('');
    attachReceiptCardEvents(DOM.dashboardRecent);
}

// ── FISCAL MODULE ──────────────────────────────────────────

function checkFiscalCalendar() {
    const today = new Date();
    const m = today.getMonth() + 1; // 1-12
    const d = today.getDate();
    
    let isAlertPeriod = false;
    
    // Q1: 1-20 Abril (m=4), Q2: 1-20 Julio (m=7)
    // Q3: 1-20 Octubre (m=10), Q4: 1-20 Enero (m=1)
    if ([1, 4, 7, 10].includes(m) && d >= 1 && d <= 20) {
        isAlertPeriod = true;
    }
    
    const alertBanner = document.getElementById('fiscal-alert-banner');
    if (alertBanner) {
        if (isAlertPeriod) {
            alertBanner.classList.remove('hidden');
        } else {
            alertBanner.classList.add('hidden');
        }
    }
}

function renderFiscalSummary() {
    const today = new Date();
    const m = today.getMonth() + 1;
    let quarterMonths = [];
    if (m >= 1 && m <= 3) quarterMonths = ['01', '02', '03'];
    else if (m >= 4 && m <= 6) quarterMonths = ['04', '05', '06'];
    else if (m >= 7 && m <= 9) quarterMonths = ['07', '08', '09'];
    else quarterMonths = ['10', '11', '12'];
    
    const year = today.getFullYear().toString();
    const quarterPrefixes = quarterMonths.map(qm => `${year}-${qm}`);
    
    const quarterReceipts = receipts.filter(r => {
        if (!r.date) return false;
        return quarterPrefixes.some(prefix => r.date.startsWith(prefix));
    });
    
    const qSpend = quarterReceipts.reduce((s, r) => s + (r.total || 0), 0);
    const qIva = qSpend * 0.21; // roughly 21%
    
    const spendEl = document.getElementById('fiscal-quarter-spend');
    const ivaEl = document.getElementById('fiscal-quarter-iva');
    if (spendEl) spendEl.textContent = currency.format(qSpend);
    if (ivaEl) ivaEl.textContent = currency.format(qIva);
}

// ── RECEIPT CARDS ──────────────────────────────────────────

function renderReceiptCard(receipt) {
    const products = receipt.products || [];
    const previewProducts = products.slice(0, 3);
    const moreCount = products.length - 3;

    const chips = previewProducts.map(p =>
        `<span class="product-chip">${escapeHtml(p.name)}</span>`
    ).join('');
    const moreChip = moreCount > 0 ? `<span class="product-chip more">+${moreCount} más</span>` : '';

    return `
        <div class="receipt-card" data-id="${receipt.id}">
            <div class="receipt-card-header">
                <div class="receipt-store-info">
                    <div class="store-avatar">${getStoreInitial(receipt.store)}</div>
                    <div>
                        <div class="store-name">${escapeHtml(receipt.store || 'Comercio desconocido')}</div>
                        <div class="receipt-date">${formatDateStr(receipt.date)}</div>
                    </div>
                </div>
                <div class="receipt-total">${currency.format(receipt.total || 0)}</div>
            </div>
            <div class="receipt-products-preview">${chips}${moreChip}</div>
            <div class="receipt-card-footer">
                <span class="receipt-items-count">${products.length} producto${products.length !== 1 ? 's' : ''}</span>
                <div class="receipt-actions">
                    <button class="btn-icon btn-view-receipt" title="Ver detalle" data-id="${receipt.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                    <button class="btn-icon danger btn-delete-receipt-card" title="Eliminar" data-id="${receipt.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function attachReceiptCardEvents(container) {
    container.querySelectorAll('.btn-view-receipt').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDetailModal(btn.dataset.id);
        });
    });

    container.querySelectorAll('.btn-delete-receipt-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteReceipt(btn.dataset.id);
        });
    });

    container.querySelectorAll('.receipt-card').forEach(card => {
        card.addEventListener('click', () => {
            openDetailModal(card.dataset.id);
        });
    });
}

function renderEmptyState(title, text) {
    return `
        <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <h3>${title}</h3>
            <p>${text}</p>
        </div>
    `;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ── RECEIPTS LIST ──────────────────────────────────────────

function renderReceiptsList() {
    const query = (DOM.searchReceipts.value || '').toLowerCase().trim();
    const storeFilter = DOM.filterStore.value;
    const monthFilter = DOM.filterMonth.value;

    // Populate store filter options
    const stores = [...new Set(receipts.map(r => r.store).filter(Boolean))].sort();
    const currentStoreVal = DOM.filterStore.value;
    DOM.filterStore.innerHTML = '<option value="">Todos los comercios</option>' +
        stores.map(s => `<option value="${escapeHtml(s)}" ${s === currentStoreVal ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');

    // Filter
    let filtered = [...receipts];

    if (query) {
        filtered = filtered.filter(r => {
            const storeMatch = (r.store || '').toLowerCase().includes(query);
            const productsMatch = (r.products || []).some(p => p.name.toLowerCase().includes(query));
            const notesMatch = (r.notes || '').toLowerCase().includes(query);
            return storeMatch || productsMatch || notesMatch;
        });
    }

    if (storeFilter) {
        filtered = filtered.filter(r => r.store === storeFilter);
    }

    if (monthFilter) {
        filtered = filtered.filter(r => r.date && r.date.startsWith(monthFilter));
    }

    // Sort by date desc
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        DOM.receiptsList.innerHTML = renderEmptyState(
            'No se encontraron facturas',
            query || storeFilter || monthFilter
                ? 'Prueba a cambiar los filtros de búsqueda.'
                : 'Escanea tu primer ticket para empezar.'
        );
        return;
    }

    DOM.receiptsList.innerHTML = filtered.map(r => renderReceiptCard(r)).join('');
    attachReceiptCardEvents(DOM.receiptsList);
}

// ── DETAIL MODAL ───────────────────────────────────────────

function openDetailModal(id) {
    const receipt = receipts.find(r => r.id === id);
    if (!receipt) return;

    currentEditId = id;

    DOM.detailTitle.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        ${escapeHtml(receipt.store || 'Factura')} — ${formatDateStr(receipt.date)}
    `;

    const products = receipt.products || [];
    const rows = products.map(p => `
        <tr>
            <td>${escapeHtml(p.name)}</td>
            <td class="text-center">${p.qty}</td>
            <td class="text-right">${currency.format(p.unitPrice || 0)}</td>
            <td class="text-right">${currency.format(p.totalPrice || 0)}</td>
        </tr>
    `).join('');

    const notesHtml = receipt.notes ? `<p style="font-size:13px;color:var(--text-secondary);margin-top:16px;"><strong>Notas:</strong> ${escapeHtml(receipt.notes)}</p>` : '';

    DOM.detailBody.innerHTML = `
        <div class="products-table-wrapper">
            <table class="products-table">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th class="text-center">Cant.</th>
                        <th class="text-right">P. Unit.</th>
                        <th class="text-right">Total</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="3" class="text-right">TOTAL</td>
                        <td class="text-right">${currency.format(receipt.total || 0)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        ${notesHtml}
    `;

    openModal(DOM.modalDetail);
}

// ── DELETE RECEIPT ──────────────────────────────────────────

async function deleteReceipt(id) {
    const receipt = receipts.find(r => r.id === id);
    if (!receipt) return;

    if (confirm(`¿Eliminar la factura de "${receipt.store || 'Desconocido'}" del ${formatDateStr(receipt.date)}?`)) {
        // Delete from Firebase
        await db.collection('users').doc(currentUserUid).collection('receipts').doc(id).delete();
        await deleteReceiptImage(id);
        
        closeAllModals();
        showToast('Factura eliminada', 'success');
        // Note: onSnapshot handles the UI update automatically!
    }
}

// ── SHOPPING LIST ──────────────────────────────────────────

function renderShoppingList() {
    const month = DOM.shoppingMonth.value || getCurrentMonth();
    DOM.shoppingMonth.value = month;

    const monthReceipts = getMonthReceipts(month);

    // Aggregate products
    const productMap = {};
    monthReceipts.forEach(r => {
        (r.products || []).forEach(p => {
            const key = p.name.toLowerCase().trim();
            if (!productMap[key]) {
                productMap[key] = {
                    name: p.name,
                    totalQty: 0,
                    totalSpend: 0,
                    appearances: 0,
                    stores: new Set()
                };
            }
            productMap[key].totalQty += (p.qty || 1);
            productMap[key].totalSpend += (p.totalPrice || 0);
            productMap[key].appearances++;
            if (r.store) productMap[key].stores.add(r.store);
        });
    });

    const sorted = Object.values(productMap).sort((a, b) => b.totalSpend - a.totalSpend);

    if (sorted.length === 0) {
        DOM.shoppingList.innerHTML = renderEmptyState(
            'Sin datos para este mes',
            'Escanea facturas de este periodo para ver tu lista de compra agregada.'
        );
        return;
    }

    DOM.shoppingList.innerHTML = sorted.map(item => {
        const storesStr = [...item.stores].join(', ');
        return `
            <div class="shopping-item">
                <div class="shopping-item-info">
                    <div class="shopping-item-name">${escapeHtml(item.name)}</div>
                    <div class="shopping-item-details">
                        <span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                            ${item.totalQty} uds.
                        </span>
                        <span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                            ${storesStr || '—'}
                        </span>
                    </div>
                </div>
                <div class="shopping-item-total">
                    <div class="shopping-item-price">${currency.format(item.totalSpend)}</div>
                    <div class="shopping-item-frequency">${item.appearances} compra${item.appearances !== 1 ? 's' : ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ── PRODUCTS & CATEGORIES ──────────────────────────────────

function renderProductsSection() {
    const month = DOM.productsMonth.value || getCurrentMonth();
    DOM.productsMonth.value = month;

    const monthReceipts = getMonthReceipts(month);

    // Group products
    const productMap = {}; // name -> { totalQty, totalSpend, category }
    let spendByCategory = {
        'peluqueria': 0,
        'estetica': 0,
        'general': 0,
        'sin-asignar': 0
    };

    monthReceipts.forEach(r => {
        (r.products || []).forEach(p => {
            const key = p.name.toLowerCase().trim();
            if (!productMap[key]) {
                productMap[key] = {
                    name: p.name,
                    totalQty: 0,
                    totalSpend: 0,
                    category: productCategories[key] || 'sin-asignar'
                };
            }
            productMap[key].totalQty += (p.qty || 1);
            productMap[key].totalSpend += (p.totalPrice || 0);
        });
    });

    const productsList = Object.values(productMap).sort((a, b) => b.totalSpend - a.totalSpend);

    // Calculate totals
    productsList.forEach(p => {
        spendByCategory[p.category] += p.totalSpend;
    });

    // Render summary cards
    const cats = [
        { id: 'peluqueria', label: 'Peluquería', class: 'cat-peluqueria' },
        { id: 'estetica', label: 'Estética', class: 'cat-estetica' },
        { id: 'general', label: 'General', class: 'cat-general' },
        { id: 'sin-asignar', label: 'Sin Asignar', class: 'cat-sin-asignar' }
    ];

    DOM.productsCategorySummary.innerHTML = cats.map(c => {
        const amount = spendByCategory[c.id];
        const count = productsList.filter(p => p.category === c.id).length;
        return `
            <div class="category-card ${c.class}">
                <div class="category-card-title">${c.label}</div>
                <div class="category-card-amount">${currency.format(amount)}</div>
                <div class="category-card-count">${count} producto${count !== 1 ? 's' : ''}</div>
            </div>
        `;
    }).join('');

    // Render table
    if (productsList.length === 0) {
        DOM.productsCategorizationBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding: 30px; color: var(--text-muted);">
                    No hay productos en este mes.
                </td>
            </tr>
        `;
        return;
    }

    DOM.productsCategorizationBody.innerHTML = productsList.map(p => `
        <tr>
            <td style="font-weight:500;">${escapeHtml(p.name)}</td>
            <td class="text-center">${p.totalQty}</td>
            <td class="text-right" style="color:var(--sky-accent);font-weight:600;">${currency.format(p.totalSpend)}</td>
            <td>
                <select class="category-select" data-product-key="${escapeHtml(p.name.toLowerCase().trim())}">
                    <option value="sin-asignar" ${p.category === 'sin-asignar' ? 'selected' : ''}>Sin asignar</option>
                    <option value="peluqueria" ${p.category === 'peluqueria' ? 'selected' : ''}>Peluquería</option>
                    <option value="estetica" ${p.category === 'estetica' ? 'selected' : ''}>Estética</option>
                    <option value="general" ${p.category === 'general' ? 'selected' : ''}>General</option>
                </select>
            </td>
        </tr>
    `).join('');

    // Add event listeners to selects
    const selects = DOM.productsCategorizationBody.querySelectorAll('.category-select');
    selects.forEach(select => {
        select.addEventListener('change', async (e) => {
            const key = e.target.getAttribute('data-product-key');
            const newCat = e.target.value;
            
            // Update state
            if (newCat === 'sin-asignar') {
                delete productCategories[key];
            } else {
                productCategories[key] = newCat;
            }
            
            // Persist and re-render
            await saveProductCategories();
            renderProductsSection();
        });
    });
}

// ── REPORTS ────────────────────────────────────────────────

function renderReports() {
    const month = DOM.reportsMonth.value || getCurrentMonth();
    DOM.reportsMonth.value = month;

    const monthReceipts = getMonthReceipts(month);

    // Summary cards
    const totalSpend = monthReceipts.reduce((s, r) => s + (r.total || 0), 0);
    const totalProducts = monthReceipts.reduce((s, r) => s + (r.products || []).length, 0);
    const uniqueStores = new Set(monthReceipts.map(r => r.store).filter(Boolean)).size;

    // Previous month comparison
    const [year, mo] = month.split('-').map(Number);
    const prevMonthStr = `${mo === 1 ? year - 1 : year}-${String(mo === 1 ? 12 : mo - 1).padStart(2, '0')}`;
    const prevReceipts = getMonthReceipts(prevMonthStr);
    const prevSpend = prevReceipts.reduce((s, r) => s + (r.total || 0), 0);
    const spendChange = prevSpend > 0 ? ((totalSpend - prevSpend) / prevSpend * 100) : 0;
    const changeClass = spendChange > 0 ? 'up' : spendChange < 0 ? 'down' : '';
    const changeIcon = spendChange > 0
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>'
        : spendChange < 0
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>'
            : '';

    DOM.reportsSummary.innerHTML = `
        <div class="summary-card">
            <div class="summary-value">${currency.format(totalSpend)}</div>
            <div class="summary-label">Gasto Total</div>
            ${prevSpend > 0 ? `<div class="summary-change ${changeClass}">${changeIcon} ${Math.abs(spendChange).toFixed(1)}% vs mes anterior</div>` : ''}
        </div>
        <div class="summary-card">
            <div class="summary-value">${monthReceipts.length}</div>
            <div class="summary-label">Facturas</div>
        </div>
        <div class="summary-card">
            <div class="summary-value">${totalProducts}</div>
            <div class="summary-label">Productos Comprados</div>
        </div>
        <div class="summary-card">
            <div class="summary-value">${uniqueStores}</div>
            <div class="summary-label">Comercios Visitados</div>
        </div>
    `;

    // Chart: Spend by store
    const storeSpend = {};
    monthReceipts.forEach(r => {
        const s = r.store || 'Desconocido';
        storeSpend[s] = (storeSpend[s] || 0) + (r.total || 0);
    });
    const storeEntries = Object.entries(storeSpend).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxStoreSpend = storeEntries.length > 0 ? storeEntries[0][1] : 1;

    const colors = ['', 'green', 'gold', 'coral', '', 'green', 'gold', 'coral'];

    DOM.barsByStore.innerHTML = storeEntries.length > 0
        ? storeEntries.map((entry, i) => {
            const pct = Math.max(5, (entry[1] / maxStoreSpend) * 100);
            return `
                <div class="bar-row">
                    <span class="bar-label">${escapeHtml(entry[0])}</span>
                    <div class="bar-track">
                        <div class="bar-fill ${colors[i % colors.length]}" style="width:${pct}%">
                            <span class="bar-value">${currency.format(entry[1])}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('')
        : '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Sin datos</p>';

    // Chart: Top products by spend
    const productSpend = {};
    monthReceipts.forEach(r => {
        (r.products || []).forEach(p => {
            const key = p.name.toLowerCase().trim();
            if (!productSpend[key]) productSpend[key] = { name: p.name, total: 0 };
            productSpend[key].total += (p.totalPrice || 0);
        });
    });
    const topProducts = Object.values(productSpend).sort((a, b) => b.total - a.total).slice(0, 8);
    const maxProduct = topProducts.length > 0 ? topProducts[0].total : 1;

    DOM.barsTopProducts.innerHTML = topProducts.length > 0
        ? topProducts.map((p, i) => {
            const pct = Math.max(5, (p.total / maxProduct) * 100);
            return `
                <div class="bar-row">
                    <span class="bar-label">${escapeHtml(p.name)}</span>
                    <div class="bar-track">
                        <div class="bar-fill ${colors[(i + 1) % colors.length]}" style="width:${pct}%">
                            <span class="bar-value">${currency.format(p.total)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('')
        : '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Sin datos</p>';

    // Chart: Most frequent products — enhanced with qty info
    const productFreq = {};
    monthReceipts.forEach(r => {
        (r.products || []).forEach(p => {
            const key = p.name.toLowerCase().trim();
            if (!productFreq[key]) productFreq[key] = { name: p.name, count: 0, totalQty: 0 };
            productFreq[key].count++;
            productFreq[key].totalQty += (p.qty || 1);
        });
    });
    const freqProducts = Object.values(productFreq).sort((a, b) => b.count - a.count).slice(0, 10);
    const maxFreq = freqProducts.length > 0 ? freqProducts[0].count : 1;

    DOM.barsFrequency.innerHTML = freqProducts.length > 0
        ? freqProducts.map((p, i) => {
            const pct = Math.max(5, (p.count / maxFreq) * 100);
            return `
                <div class="bar-row">
                    <span class="bar-label">${escapeHtml(p.name)}</span>
                    <div class="bar-track">
                        <div class="bar-fill ${colors[(i + 2) % colors.length]}" style="width:${pct}%">
                            <span class="bar-value">${p.count} veces · ${p.totalQty} uds</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('')
        : '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Sin datos</p>';

    // Render new detail table and forecast
    renderProductDetailTable(monthReceipts, month);
    renderPurchaseForecast(month);
}

// ── PRODUCT DETAIL TABLE ───────────────────────────────────

function renderProductDetailTable(monthReceipts, month) {
    const container = document.getElementById('product-detail-table');
    if (!container) return;

    // Aggregate detailed product data
    const productMap = {};
    monthReceipts.forEach(r => {
        (r.products || []).forEach(p => {
            const key = p.name.toLowerCase().trim();
            if (!productMap[key]) {
                productMap[key] = {
                    name: p.name,
                    totalQty: 0,
                    totalSpend: 0,
                    appearances: 0,
                    stores: new Set()
                };
            }
            productMap[key].totalQty += (p.qty || 1);
            productMap[key].totalSpend += (p.totalPrice || 0);
            productMap[key].appearances++;
            if (r.store) productMap[key].stores.add(r.store);
        });
    });

    const products = Object.values(productMap).sort((a, b) => b.totalSpend - a.totalSpend);

    if (products.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Sin datos para este mes</p>';
        return;
    }

    const totalMonthSpend = products.reduce((s, p) => s + p.totalSpend, 0);

    const rows = products.map((p, i) => {
        const avgPrice = p.totalQty > 0 ? p.totalSpend / p.totalQty : 0;
        const pctOfTotal = totalMonthSpend > 0 ? ((p.totalSpend / totalMonthSpend) * 100).toFixed(1) : '0.0';
        const rankClass = i < 3 ? 'rank-top' : '';

        return `
            <tr>
                <td>
                    <div class="product-name-cell">
                        <div class="product-rank ${rankClass}">${i + 1}</div>
                        ${escapeHtml(p.name)}
                    </div>
                </td>
                <td class="text-center"><strong>${p.totalQty}</strong></td>
                <td class="text-center">${p.appearances}</td>
                <td class="text-right product-avg-price">${currency.format(avgPrice)}</td>
                <td class="text-right product-spend-highlight">${currency.format(p.totalSpend)}</td>
                <td class="text-right">${pctOfTotal}%</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div style="overflow-x:auto;">
            <table class="product-detail-table">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th class="text-center">Cant. Total</th>
                        <th class="text-center">Compras</th>
                        <th class="text-right">Precio Medio</th>
                        <th class="text-right">Gasto Total</th>
                        <th class="text-right">% del Mes</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

// ── PURCHASE FORECAST ──────────────────────────────────────

function renderPurchaseForecast(selectedMonth) {
    const container = document.getElementById('forecast-list');
    if (!container) return;

    // Analyze the last 3 months of data to build purchase patterns
    const [selYear, selMo] = selectedMonth.split('-').map(Number);

    // Get receipts from 3 months: selected month and 2 prior
    const monthsToAnalyze = [];
    for (let i = 0; i < 3; i++) {
        let y = selYear;
        let m = selMo - i;
        if (m <= 0) { m += 12; y--; }
        monthsToAnalyze.push(`${y}-${String(m).padStart(2, '0')}`);
    }

    // Collect per-month product data
    const productHistory = {};
    monthsToAnalyze.forEach(monthStr => {
        const mReceipts = getMonthReceipts(monthStr);
        mReceipts.forEach(r => {
            (r.products || []).forEach(p => {
                const key = p.name.toLowerCase().trim();
                if (!productHistory[key]) {
                    productHistory[key] = {
                        name: p.name,
                        monthlyData: {},
                        totalQty: 0,
                        totalSpend: 0,
                        totalAppearances: 0,
                        stores: new Set()
                    };
                }
                if (!productHistory[key].monthlyData[monthStr]) {
                    productHistory[key].monthlyData[monthStr] = { qty: 0, spend: 0, appearances: 0 };
                }
                productHistory[key].monthlyData[monthStr].qty += (p.qty || 1);
                productHistory[key].monthlyData[monthStr].spend += (p.totalPrice || 0);
                productHistory[key].monthlyData[monthStr].appearances++;
                productHistory[key].totalQty += (p.qty || 1);
                productHistory[key].totalSpend += (p.totalPrice || 0);
                productHistory[key].totalAppearances++;
                if (r.store) productHistory[key].stores.add(r.store);
            });
        });
    });

    // Calculate forecast for each product
    const forecasts = [];
    const monthsWithData = monthsToAnalyze.filter(m => getMonthReceipts(m).length > 0).length;

    Object.values(productHistory).forEach(product => {
        const monthsBought = Object.keys(product.monthlyData).length;
        const frequency = monthsWithData > 0 ? monthsBought / monthsWithData : 0;
        const avgQtyPerMonth = monthsWithData > 0 ? product.totalQty / monthsWithData : 0;
        const avgSpendPerMonth = monthsWithData > 0 ? product.totalSpend / monthsWithData : 0;

        // Only include products bought in at least 2 months, or bought frequently in 1 month
        if (monthsBought >= 2 || product.totalAppearances >= 3) {
            let urgency = 'low';
            let urgencyLabel = 'Opcional';

            if (frequency >= 0.8) {
                urgency = 'high';
                urgencyLabel = 'Compra segura';
            } else if (frequency >= 0.5) {
                urgency = 'medium';
                urgencyLabel = 'Probable';
            }

            forecasts.push({
                name: product.name,
                urgency,
                urgencyLabel,
                frequency,
                avgQtyPerMonth: Math.round(avgQtyPerMonth * 10) / 10,
                avgSpendPerMonth,
                monthsBought,
                totalAppearances: product.totalAppearances,
                stores: [...product.stores]
            });
        }
    });

    // Sort by urgency (high first), then by frequency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    forecasts.sort((a, b) => {
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
            return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return b.frequency - a.frequency;
    });

    if (forecasts.length === 0) {
        container.innerHTML = `
            <div class="forecast-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <p>Necesitas al menos 2 meses de facturas para generar previsiones de compra.<br>Sigue escaneando tus tickets para que el sistema aprenda tus patrones.</p>
            </div>
        `;
        return;
    }

    const urgencyIcons = {
        high: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>',
        medium: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
        low: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>'
    };

    container.innerHTML = `
        <div class="forecast-grid">
            ${forecasts.map(f => `
                <div class="forecast-card">
                    <div class="forecast-card-icon urgency-${f.urgency}">
                        ${urgencyIcons[f.urgency]}
                    </div>
                    <div class="forecast-card-body">
                        <div class="forecast-card-name">${escapeHtml(f.name)}</div>
                        <div class="forecast-card-stats">
                            <span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                                ~${f.avgQtyPerMonth} uds/mes
                            </span>
                            <span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                                ~${currency.format(f.avgSpendPerMonth)}/mes
                            </span>
                            <span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                                ${f.stores.join(', ') || '—'}
                            </span>
                        </div>
                        <div class="forecast-badge urgency-${f.urgency}">
                            ${f.urgencyLabel} · ${f.monthsBought}/${monthsToAnalyze.length} meses
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ── SETTINGS ───────────────────────────────────────────────

function renderSettings() {
    const key = getApiKey();
    DOM.settingsApiKey.value = key;
    updateApiKeyStatus();
}

function updateApiKeyStatus() {
    const key = getApiKey();
    const statusEl = DOM.apiKeyStatus;
    if (key) {
        statusEl.className = 'api-key-status connected';
        statusEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"></circle></svg><span>Conectada — ' + key.substring(0, 8) + '...</span>';
    } else {
        statusEl.className = 'api-key-status disconnected';
        statusEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"></circle></svg><span>No configurada</span>';
    }
}

// ── MODAL UTILITIES ────────────────────────────────────────

function openModal(modalEl) {
    modalEl.classList.add('open');
}

function closeModal(modalEl) {
    modalEl.classList.remove('open');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

// ── SCAN FLOW ──────────────────────────────────────────────



let selectedFile = null;
let selectedImageBase64 = null;

function openScanModal() {
    const key = getApiKey();
    if (!key) {
        showToast('Configura tu API Key de Gemini antes de escanear', 'warning');
        navigateTo('settings');
        return;
    }
    // Reset state
    selectedFile = null;
    selectedImageBase64 = null;
    DOM.uploadPreview.style.display = 'none';
    DOM.uploadPreview.src = '';
    DOM.btnProcessScan.disabled = true;
    DOM.scanUploadState.style.display = 'block';
    DOM.scanLoadingState.style.display = 'none';
    DOM.receiptFileInput.value = '';

    openModal(DOM.modalScan);
}

function compressImage(file, maxWidth = 800) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress to JPEG at 0.7 quality to ensure small payload
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(compressedDataUrl);
            };
        };
    });
}

async function handleFileSelect(file) {
    if (!file) return;

    // Validate
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/heic'];
    if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
        showToast('Formato no soportado. Usa JPG, PNG, WEBP o HEIC.', 'error');
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        showToast('La imagen original es demasiado grande. Máximo 15MB.', 'error');
        return;
    }

    selectedFile = file;

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        DOM.uploadPreview.src = e.target.result;
        DOM.uploadPreview.style.display = 'block';
        DOM.btnProcessScan.disabled = false;
    };
    reader.readAsDataURL(file);
}

async function processWithGemini() {
    if (!selectedFile) return;
    
    const apiKey = getApiKey();
    if (!apiKey) {
        showToast('API Key no configurada', 'error');
        return;
    }

    DOM.scanUploadState.style.display = 'none';
    DOM.scanLoadingState.style.display = 'block';
    DOM.btnProcessScan.disabled = true;

    try {
        const compressedDataUrl = await compressImage(selectedFile, 800);
        selectedImageBase64 = compressedDataUrl.split(',')[1];

        const prompt = `Analiza esta imagen de un ticket/factura de compra y extrae la información en formato JSON estricto.

IMPORTANTE: Responde ÚNICAMENTE con un JSON válido, sin markdown, sin backticks, sin texto adicional.

El JSON debe tener esta estructura exacta:
{
  "store": "nombre del comercio",
  "date": "YYYY-MM-DD",
  "products": [
    {
      "name": "nombre del producto",
      "qty": 1,
      "unitPrice": 0.00,
      "totalPrice": 0.00
    }
  ],
  "total": 0.00
}

Reglas:
- Si no puedes leer el nombre del comercio, pon "Desconocido"
- Si no puedes leer la fecha, usa la fecha de hoy: ${new Date().toISOString().split('T')[0]}
- Los precios deben ser números con 2 decimales
- qty debe ser un entero (mínimo 1)
- totalPrice = qty * unitPrice
- total es la suma de todos los totalPrice
- Extrae TODOS los productos visibles en el ticket
- El nombre del producto debe ser descriptivo y en español si es posible`;

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: selectedFile.type,
                                data: selectedImageBase64
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 4096,
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `Error ${response.status}`);
        }

        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        let jsonStr = text.replace(/^```(?:json)?s*/i, '').replace(/```s*$/i, '').trim();
        jsonStr = jsonStr.replace(/,s*([]}])/g, '$1');

        const parsed = JSON.parse(jsonStr);

        if (!parsed.products || !Array.isArray(parsed.products)) {
            throw new Error('La IA no devolvió una lista válida');
        }

        extractedData = {
            store: parsed.store || 'Desconocido',
            date: parsed.date || new Date().toISOString().split('T')[0],
            products: parsed.products.map(p => ({
                name: String(p.name || 'Producto').trim(),
                qty: Math.max(1, Math.round(Number(p.qty) || 1)),
                unitPrice: Math.max(0, Number(p.unitPrice) || 0),
                totalPrice: Math.max(0, Number(p.totalPrice) || 0)
            })),
            total: Number(parsed.total) || 0,
            notes: ''
        };

        const calcTotal = extractedData.products.reduce((s, p) => s + p.totalPrice, 0);
        if (Math.abs(calcTotal - extractedData.total) > 0.5) extractedData.total = calcTotal;

        closeModal(DOM.modalScan);
        openReviewModal();
        showToast(`${extractedData.products.length} productos extraídos`, 'success');

    } catch (error) {
        console.error('API Error:', error);
        showToast(`Error leyendo ticket: ${error.message}`, 'error');
        
        DOM.scanUploadState.style.display = 'block';
        DOM.scanLoadingState.style.display = 'none';
        DOM.btnProcessScan.disabled = false;
    }
}

// ── REVIEW MODAL ───────────────────────────────────────────

function openReviewModal() {
    if (!extractedData) return;

    DOM.reviewStore.value = extractedData.store;
    DOM.reviewDate.value = extractedData.date;
    DOM.reviewNotes.value = extractedData.notes || '';

    renderReviewProducts();
    openModal(DOM.modalReview);
}

function renderReviewProducts() {
    if (!extractedData) return;

    DOM.reviewProductsBody.innerHTML = extractedData.products.map((p, i) => `
        <tr data-index="${i}">
            <td><input type="text" value="${escapeHtml(p.name)}" class="review-name" data-index="${i}"></td>
            <td class="text-center"><input type="number" value="${p.qty}" min="1" step="1" class="review-qty" data-index="${i}"></td>
            <td class="text-right"><input type="number" value="${p.unitPrice.toFixed(2)}" min="0" step="0.01" class="review-unit-price" data-index="${i}"></td>
            <td class="text-right"><strong>${currency.format(p.totalPrice)}</strong></td>
            <td class="text-center">
                <button class="btn-remove-row" data-index="${i}" title="Eliminar producto">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </td>
        </tr>
    `).join('');

    updateReviewTotal();
    attachReviewEvents();
}

function attachReviewEvents() {
    // Name changes
    DOM.reviewProductsBody.querySelectorAll('.review-name').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (extractedData.products[idx]) {
                extractedData.products[idx].name = e.target.value;
            }
        });
    });

    // Qty & price changes → recalc
    DOM.reviewProductsBody.querySelectorAll('.review-qty, .review-unit-price').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            const p = extractedData.products[idx];
            if (!p) return;

            const row = e.target.closest('tr');
            const qty = Math.max(1, parseInt(row.querySelector('.review-qty').value) || 1);
            const unitPrice = Math.max(0, parseFloat(row.querySelector('.review-unit-price').value) || 0);

            p.qty = qty;
            p.unitPrice = unitPrice;
            p.totalPrice = +(qty * unitPrice).toFixed(2);

            // Update total cell in this row
            row.querySelector('td:nth-child(4) strong').textContent = currency.format(p.totalPrice);
            updateReviewTotal();
        });
    });

    // Remove row
    DOM.reviewProductsBody.querySelectorAll('.btn-remove-row').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            extractedData.products.splice(idx, 1);
            renderReviewProducts();
        });
    });
}

function updateReviewTotal() {
    if (!extractedData) return;
    const total = extractedData.products.reduce((s, p) => s + p.totalPrice, 0);
    extractedData.total = +total.toFixed(2);
    DOM.reviewTotal.textContent = currency.format(total);
}

function addProductRow() {
    if (!extractedData) return;
    extractedData.products.push({
        name: '',
        qty: 1,
        unitPrice: 0,
        totalPrice: 0
    });
    renderReviewProducts();
    // Focus the new row's name input
    const inputs = DOM.reviewProductsBody.querySelectorAll('.review-name');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
}

async function saveReviewedReceipt() {
    if (!extractedData) return;

    // Update store/date from form
    extractedData.store = DOM.reviewStore.value.trim() || 'Desconocido';
    extractedData.date = DOM.reviewDate.value || new Date().toISOString().split('T')[0];
    extractedData.notes = DOM.reviewNotes.value.trim();

    // Remove empty products
    extractedData.products = extractedData.products.filter(p => p.name.trim());

    if (extractedData.products.length === 0) {
        showToast('Añade al menos un producto', 'warning');
        return;
    }

    // Recalc total — ensure numeric
    extractedData.total = +extractedData.products.reduce((s, p) => s + (Number(p.totalPrice) || 0), 0).toFixed(2);

    const receiptId = generateId();
    const receipt = {
        id: receiptId,
        store: extractedData.store,
        date: extractedData.date,
        total: extractedData.total,
        products: extractedData.products,
        notes: extractedData.notes,
        hasImage: !!selectedImageBase64,
        createdAt: new Date().toISOString()
    };

    // Sanitize before saving
    const sanitized = sanitizeReceipt(receipt);
    
    // Save image separately and get URL
    if (selectedImageBase64) {
        const url = await saveReceiptImage(receiptId, selectedImageBase64);
        if (url) sanitized.imageUrl = url;
    }

    // Save to Firebase (this will trigger onSnapshot to update UI)
    await db.collection('users').doc(currentUserUid).collection('receipts').doc(sanitized.id).set(sanitized);

    closeModal(DOM.modalReview);
    extractedData = null;
    selectedImageBase64 = null;
    selectedFile = null;

    showToast(`Factura de "${receipt.store}" guardada con ${receipt.products.length} productos`, 'success');
}

// ── EXPORT / IMPORT ────────────────────────────────────────

async function exportData() {
    if (receipts.length === 0) {
        showToast('No hay datos para exportar', 'info');
        return;
    }

    showToast('Generando ZIP con imágenes, por favor espera...', 'info');

    try {
        const zip = new JSZip();

        // 1. Create CSV
        let csv = 'ID,Comercio,Fecha,Total,Notas\n';
        receipts.forEach(r => {
            csv += `"${r.id}","${(r.store||'').replace(/"/g, '""')}","${r.date}",${r.total},"${(r.notes||'').replace(/"/g, '""')}"\n`;
        });
        zip.file('resumen_gastos.csv', csv);

        // 2. Add full JSON data for backup
        zip.file('datos_completos.json', JSON.stringify(receipts, null, 2));

        // 3. Add images from Firebase
        const folder = zip.folder('facturas');
        for (const r of receipts) {
            if (r.hasImage || r.imageUrl) {
                let imgUrl = r.imageUrl || await getReceiptImage(r.id);
                if (imgUrl) {
                    try {
                        const res = await fetch(imgUrl);
                        const blob = await res.blob();
                        const safeStore = (r.store || 'desconocido').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        folder.file(`${r.date}_${safeStore}_${r.id}.jpg`, blob);
                    } catch(err) {
                        console.warn('Could not fetch image for zip', r.id, err);
                    }
                }
            }
        }

        const content = await zip.generateAsync({type: 'blob'});

        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thalassa_gestoria_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        showToast('ZIP exportado y listo para la gestoría', 'success');
    } catch (e) {
        console.error('Error exporting ZIP', e);
        showToast('Error al exportar el archivo ZIP', 'error');
    }
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('Formato inválido');

            if (confirm(`¿Importar ${imported.length} facturas? Esto se añadirá a tus datos actuales en la Nube.`)) {
                showToast('Importando a la nube, por favor espera...', 'info');
                for (const r of imported) {
                    if (!r.id) r.id = generateId();
                    if (r.imageBase64 && !r.imageUrl) {
                        const url = await saveReceiptImage(r.id, r.imageBase64);
                        if (url) r.imageUrl = url;
                    }
                    const sanitized = sanitizeReceipt(r);
                    delete sanitized.imageBase64;
                    await db.collection('users').doc(currentUserUid).collection('receipts').doc(sanitized.id).set(sanitized);
                }
                showToast(`${imported.length} facturas importadas correctamente`, 'success');
            }
        } catch (err) {
            showToast('Error al leer el archivo JSON', 'error');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

// ── EVENT BINDINGS ─────────────────────────────────────────

function initEventListeners() {
    // Navigation
    DOM.navItems.forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.section));
    });

    // Mobile
    DOM.mobileBurger.addEventListener('click', () => {
        DOM.sidebar.classList.toggle('open');
        DOM.mobileOverlay.classList.toggle('open');
    });
    DOM.mobileOverlay.addEventListener('click', () => {
        DOM.sidebar.classList.remove('open');
        DOM.mobileOverlay.classList.remove('open');
    });

    // Dashboard "Go to settings" button
    DOM.btnGoSettings.addEventListener('click', () => navigateTo('settings'));

    // Scan buttons
    [DOM.btnScanDashboard, DOM.btnScanReceipts, DOM.btnScanSidebar].forEach(btn => {
        if (btn) btn.addEventListener('click', openScanModal);
    });

    // Upload zone - drag & drop
    DOM.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.uploadZone.classList.add('drag-over');
    });
    DOM.uploadZone.addEventListener('dragleave', () => {
        DOM.uploadZone.classList.remove('drag-over');
    });
    DOM.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.uploadZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files);
    });

    // File input
    DOM.receiptFileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFileSelect(e.target.files[0]);
    });

    // Process scan
    DOM.btnProcessScan.addEventListener('click', processWithGemini);

    // Scan modal close
    document.getElementById('btn-close-scan').addEventListener('click', () => closeModal(DOM.modalScan));
    document.getElementById('btn-cancel-scan').addEventListener('click', () => closeModal(DOM.modalScan));

    // Review modal
    document.getElementById('btn-close-review').addEventListener('click', () => closeModal(DOM.modalReview));
    document.getElementById('btn-cancel-review').addEventListener('click', () => {
        closeModal(DOM.modalReview);
        scanQueue = [];
        isProcessingQueue = false;
    });
    
    const btnSkip = document.getElementById('btn-skip-receipt');
    if(btnSkip) {
        btnSkip.addEventListener('click', () => {
            closeModal(DOM.modalReview);
            extractedData = null;
            selectedImageBase64 = null;
            selectedFile = null;
            processNextInQueue();
        });
    }
    DOM.btnAddProductRow.addEventListener('click', addProductRow);
    DOM.btnSaveReceipt.addEventListener('click', saveReviewedReceipt);

    // Detail modal
    document.getElementById('btn-close-detail').addEventListener('click', () => closeModal(DOM.modalDetail));
    document.getElementById('btn-close-detail-footer').addEventListener('click', () => closeModal(DOM.modalDetail));
    DOM.btnDeleteReceipt.addEventListener('click', () => {
        if (currentEditId) deleteReceipt(currentEditId);
    });

    // Click outside modals
    [DOM.modalScan, DOM.modalReview, DOM.modalDetail].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // ESC to close modals
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });

    // Settings - Save API Key
    DOM.btnSaveApiKey.addEventListener('click', () => {
        const key = DOM.settingsApiKey.value.trim();
        if (!key) {
            showToast('Introduce una API Key válida', 'warning');
            return;
        }
        setApiKey(key);
        updateApiKeyStatus();
        DOM.apiKeyBanner.classList.add('hidden');
        showToast('API Key guardada correctamente', 'success');
    });

    // Settings - Export
    DOM.btnSettingsExport.addEventListener('click', exportData);
    if (DOM.btnExportData) DOM.btnExportData.addEventListener('click', exportData);

    // Settings - Import
    DOM.btnSettingsImport.addEventListener('click', () => DOM.fileImport.click());
    DOM.fileImport.addEventListener('change', (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';
    });

    // Settings - Clear data
    DOM.btnClearData.addEventListener('click', async () => {
        if (confirm('⚠️ ¿Eliminar TODOS los datos de la nube? Esta acción no se puede deshacer.')) {
            showToast('Eliminando datos de la nube...', 'info');
            for (const r of receipts) {
                await deleteReceiptImage(r.id);
                await db.collection('users').doc(currentUserUid).collection('receipts').doc(r.id).delete();
            }
            showToast('Todos los datos han sido eliminados', 'success');
        }
    });

    // Receipts filters
    DOM.searchReceipts.addEventListener('input', renderReceiptsList);
    DOM.filterStore.addEventListener('change', renderReceiptsList);
    DOM.filterMonth.addEventListener('change', renderReceiptsList);

    // Shopping list month
    DOM.shoppingMonth.addEventListener('change', renderShoppingList);

    // Products month
    DOM.productsMonth.addEventListener('change', renderProductsSection);

    // Reports month
    DOM.reportsMonth.addEventListener('change', renderReports);
}

// ── INIT ───────────────────────────────────────────────────

async function init() {
    // Set default month values FIRST
    const currentMonth = getCurrentMonth();
    DOM.filterMonth.value = '';
    DOM.shoppingMonth.value = currentMonth;
    DOM.productsMonth.value = currentMonth;
    DOM.reportsMonth.value = currentMonth;

    // Attach event listeners before loading data so UI doesn't freeze
    initEventListeners();

    // Check API key
    updateApiKeyStatus();

    // Load receipts (this blocks if it's migrating large amounts of data)
    await loadReceipts();

    // Check Fiscal Calendar
    if (typeof checkFiscalCalendar === 'function') {
        checkFiscalCalendar();
    }
}

// ── FIREBASE AUTHENTICATION ──────────────────────────────────────

function unlockApp() {
    const lockScreen = document.getElementById('lock-screen');
    lockScreen.classList.add('hidden');
    setTimeout(() => {
        lockScreen.style.display = 'none';
    }, 500);
    init();
}

// Escuchar cambios de estado de autenticación
firebase.auth().onAuthStateChanged(async user => {
    const lockScreen = document.getElementById('lock-screen');
    if (user) {
        // Usuario logueado
        currentUserUid = user.uid;
        unlockApp();
        document.getElementById('btn-logout').addEventListener('click', () => {
            firebase.auth().signOut().then(() => {
                window.location.reload();
            });
        });
    } else {
        // Usuario no logueado
        currentUserUid = null;
        lockScreen.style.display = 'flex';
        lockScreen.classList.remove('hidden');
        initAuthUI();
    }
});

function initAuthUI() {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('auth-login-form');
    const formRegister = document.getElementById('auth-register-form');
    const errorLogin = document.getElementById('login-error');
    const errorRegister = document.getElementById('register-error');

    // Cambiar pestañas
    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.style.display = 'block';
        formRegister.style.display = 'none';
        errorLogin.textContent = '';
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        formRegister.style.display = 'block';
        formLogin.style.display = 'none';
        errorRegister.textContent = '';
    });

    // Iniciar Sesión
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const btn = document.getElementById('btn-login-submit');
        
        try {
            btn.disabled = true;
            btn.innerHTML = 'Cargando...';
            errorLogin.textContent = '';
            await firebase.auth().signInWithEmailAndPassword(email, pass);
        } catch (error) {
            console.error('Error de login:', error);
            if (error.code === 'auth/invalid-credential') {
                errorLogin.textContent = 'Email o contraseña incorrectos.';
            } else {
                errorLogin.textContent = 'Error: ' + error.message;
            }
            btn.disabled = false;
            btn.innerHTML = 'Iniciar Sesión';
            shakeCard();
        }
    });

    // Registrarse
    formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const pass = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-password-confirm').value;
        const btn = document.getElementById('btn-register-submit');
        
        if (pass !== confirm) {
            errorRegister.textContent = 'Las contraseñas no coinciden.';
            return;
        }

        try {
            btn.disabled = true;
            btn.innerHTML = 'Creando cuenta...';
            errorRegister.textContent = '';
            await firebase.auth().createUserWithEmailAndPassword(email, pass);
            // El onAuthStateChanged detectará el nuevo usuario y llamará a init() y a la migración
        } catch (error) {
            console.error('Error de registro:', error);
            if (error.code === 'auth/email-already-in-use') {
                errorRegister.textContent = 'Este email ya está registrado.';
            } else if (error.code === 'auth/weak-password') {
                errorRegister.textContent = 'La contraseña es muy débil.';
            } else if (error.code === 'auth/operation-not-allowed') {
                errorRegister.textContent = 'El registro con Email/Password no está habilitado en Firebase Console.';
            } else {
                errorRegister.textContent = 'Error: ' + error.message;
            }
            btn.disabled = false;
            btn.innerHTML = 'Registrarse';
            shakeCard();
        }
    });
}

function shakeCard() {
    const card = document.querySelector('.lock-card');
    card.style.animation = 'none';
    card.offsetHeight; // trigger reflow
    card.style.animation = 'shake 0.4s ease';
}

// Shake animation para errores
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-12px); }
    40% { transform: translateX(12px); }
    60% { transform: translateX(-8px); }
    80% { transform: translateX(8px); }
}
`;
document.head.appendChild(shakeStyle);
