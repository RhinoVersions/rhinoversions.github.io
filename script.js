// Configuration
const CONFIG = {
    // GitHub repository info - adjust based on your repo structure
    REPO_OWNER: 'RhinoVersions',
    REPO_NAME: 'rhinoversions.github.io',
    BRANCH: 'main',
    LATEST_MD_PATH: 'rhino-versions.md',
    ALL_MD_PATH: 'rhino-versions-all.md'
};

// State
let allVersions = [];
let currentSort = { column: 'date', ascending: false };

// ============================================
// Data Fetching & Parsing
// ============================================

/**
 * Detect if running locally or on GitHub Pages
 */
function isLocalEnvironment() {
    return window.location.protocol === 'file:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
}

/**
 * Fetch markdown file from GitHub raw content or local file
 */
async function fetchMarkdownFromGitHub(path) {
    // If running locally, use relative path
    if (isLocalEnvironment()) {
        const filename = path.split('/').pop();
        const response = await fetch(`./${filename}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch ${filename}: ${response.status} ${response.statusText}`);
        }

        return await response.text();
    }

    // Otherwise, fetch from GitHub raw content
    const url = `https://raw.githubusercontent.com/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/${CONFIG.BRANCH}/${path}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
    }

    return await response.text();
}

/**
 * Parse markdown links in format: - [filename](url)
 * Returns array of { filename, url }
 */
function parseMarkdownLinks(markdown) {
    const linkRegex = /- \[([^\]]+)\]\(([^)]+)\)/g;
    const links = [];
    let match;

    while ((match = linkRegex.exec(markdown)) !== null) {
        links.push({
            filename: match[1],
            url: match[2]
        });
    }

    return links;
}

/**
 * Extract version information from filename
 * Expected format: rhino_en-us_8.24.25281.15001.exe or rhino_en-us_8.24.25281.15001.dmg
 */
function parseVersionFromFilename(filename) {
    // Remove .exe or .dmg extension
    const nameWithoutExt = filename.replace(/\.(exe|dmg)$/, '');

    // Split by underscore
    const parts = nameWithoutExt.split('_');

    let locale, versionStr;
    let platform = filename.endsWith('.exe') ? 'windows' : 'mac';

    if (platform === 'windows') {
        // Expected: rhino_en-us_8.24.25281.15001
        if (parts.length < 3) {
            console.warn(`Unexpected Windows filename format: ${filename}`);
            return null;
        }
        locale = parts[1];
        versionStr = parts[2];
    } else {
        // Expected: rhino_8.25.25328.11002 (no locale)
        // OR legacy/accidental: rhino_en-us_... (handle just in case)
        if (parts.length === 3) {
            // Has locale
            locale = parts[1];
            versionStr = parts[2];
        } else if (parts.length === 2) {
            // No locale: rhino_8.25...
            locale = 'multi'; // Mac versions are multilingual
            versionStr = parts[1];
        } else {
            console.warn(`Unexpected Mac filename format: ${filename}`);
            return null;
        }
    }

    const versionParts = versionStr.split('.');

    if (versionParts.length < 4) {
        console.warn(`Unexpected version format in: ${filename}`);
        return null;
    }

    const major = versionParts[0];
    const minor = versionParts[1];
    const yyddd = versionParts[2];
    const hhmmb = versionParts[3];

    // Parse date from yyddd
    const yy = parseInt(yyddd.substring(0, 2));
    const ddd = parseInt(yyddd.substring(2));
    const year = 2000 + yy;

    // Calculate date
    const date = new Date(year, 0, 1);
    date.setDate(ddd);

    return {
        version: versionStr,
        major,
        minor,
        yyddd,
        hhmmb,
        date,
        dateString: date.toISOString().split('T')[0], // YYYY-MM-DD
        filename,
        fullVersion: `${major}.${minor}.${yyddd}.${hhmmb}`,
        locale,
        platform
    };
}

/**
 * Load and display latest version
 */
async function loadLatestVersion() {
    const loadingEl = document.getElementById('loading-latest');
    const errorEl = document.getElementById('error-latest');
    const cardEl = document.getElementById('latest-card');

    try {
        const markdown = await fetchMarkdownFromGitHub(CONFIG.LATEST_MD_PATH);
        const links = parseMarkdownLinks(markdown);

        if (links.length === 0) {
            throw new Error('No versions found in latest file');
        }

        // Find Windows (.exe) and Mac (.dmg) links for selected locale
        const localeFilter = document.getElementById('locale-filter').value;
        const targetLocale = localeFilter === 'all' ? 'en-us' : localeFilter; // Default to en-us when "all" is selected

        let windowsLink = null;
        let macLink = null;
        let versionInfo = null;

        links.forEach(link => {
            const parsed = parseVersionFromFilename(link.filename);
            if (!parsed) return;

            // For Windows, match the target locale
            if (link.filename.endsWith('.exe')) {
                if (parsed.locale === targetLocale) {
                    windowsLink = link;
                    if (!versionInfo) versionInfo = parsed;
                }
            }
            // For Mac, accept 'multi' locale (or if we ever have specific locales)
            else if (link.filename.endsWith('.dmg')) {
                // Mac is usually multi, so we accept it regardless of targetLocale
                // unless we want to be strict, but for now 'multi' is what we have.
                if (parsed.locale === 'multi' || parsed.locale === targetLocale) {
                    macLink = link;
                    // Only set versionInfo from Mac if we haven't found Windows yet
                    // (Windows usually has the locale-specific info we might want, though Mac is fine too)
                    if (!versionInfo) versionInfo = parsed;
                }
            }
        });

        if (!versionInfo) {
            throw new Error('Could not parse version information');
        }

        // Update UI
        document.getElementById('latest-version').textContent = versionInfo.fullVersion;
        document.getElementById('latest-date').textContent = formatDate(versionInfo.date);

        // Update download buttons
        const windowsBtn = document.getElementById('latest-download-windows');
        const macBtn = document.getElementById('latest-download-mac');

        if (windowsLink) {
            windowsBtn.href = windowsLink.url;
            windowsBtn.style.display = 'inline-block';
        }

        if (macLink) {
            macBtn.href = macLink.url;
            macBtn.style.display = 'inline-block';
        }

        // Show card, hide loading
        loadingEl.style.display = 'none';
        cardEl.style.display = 'block';

    } catch (error) {
        console.error('Error loading latest version:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
    }
}

/**
 * Load and display all versions
 */
async function loadAllVersions() {
    const loadingEl = document.getElementById('loading-all');
    const errorEl = document.getElementById('error-all');
    const containerEl = document.getElementById('versions-table-container');

    try {
        const markdown = await fetchMarkdownFromGitHub(CONFIG.ALL_MD_PATH);
        const links = parseMarkdownLinks(markdown);

        // Parse all versions and group by version+locale
        const versionMap = new Map();

        links.forEach(link => {
            const versionInfo = parseVersionFromFilename(link.filename);
            if (!versionInfo) return;

            const key = `${versionInfo.fullVersion}_${versionInfo.locale}`;
            if (!versionMap.has(key)) {
                versionMap.set(key, {
                    ...versionInfo,
                    windowsUrl: null,
                    macUrl: null,
                    windowsFilename: null,
                    macFilename: null
                });
            }

            const entry = versionMap.get(key);
            if (versionInfo.platform === 'windows') {
                entry.windowsUrl = link.url;
                entry.windowsFilename = link.filename;
            } else if (versionInfo.platform === 'mac') {
                entry.macUrl = link.url;
                entry.macFilename = link.filename;
            }
        });

        allVersions = Array.from(versionMap.values());

        // Display
        displayVersions(allVersions);

        // Show table, hide loading
        loadingEl.style.display = 'none';
        containerEl.style.display = 'block';

    } catch (error) {
        console.error('Error loading all versions:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
    }
}

// ============================================
// Display & Filtering
// ============================================

/**
 * Display versions in the table
 */
function displayVersions(versions) {
    const tbody = document.getElementById('versions-tbody');
    const countEl = document.getElementById('version-count');

    tbody.innerHTML = '';

    versions.forEach((version, index) => {
        const row = document.createElement('tr');
        row.style.animationDelay = `${index * 0.02}s`;
        row.style.animation = 'fadeInUp 0.5s ease both';

        // Create download buttons for available platforms
        let downloadButtons = '';
        if (version.windowsUrl) {
            downloadButtons += `<a href="${version.windowsUrl}" class="table-download-btn" target="_blank" rel="noopener noreferrer">💻 Windows</a>`;
        }
        if (version.macUrl) {
            downloadButtons += `<a href="${version.macUrl}" class="table-download-btn" target="_blank" rel="noopener noreferrer">🍎 Mac</a>`;
        }

        // Format locale for display
        let localeDisplay = version.locale.toUpperCase();
        if (version.locale === 'multi') {
            localeDisplay = 'MULTILINGUAL';
        }

        row.innerHTML = `
            <td><span class="version-number">${version.fullVersion}</span></td>
            <td>${formatDate(version.date)}</td>
            <td><span class="major-badge">Rhino ${version.major}</span></td>
            <td><span class="locale-badge">${localeDisplay}</span></td>
            <td class="download-buttons-cell">${downloadButtons}</td>
        `;

        tbody.appendChild(row);
    });

    countEl.textContent = `Showing ${versions.length} version${versions.length !== 1 ? 's' : ''}`;
}

/**
 * Filter versions based on search, major version, and locale
 */
function filterVersions() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const majorFilter = document.getElementById('major-filter').value;
    const localeFilter = document.getElementById('locale-filter').value;

    let filtered = allVersions;

    // Filter by major version
    if (majorFilter !== 'all') {
        filtered = filtered.filter(v => v.major === majorFilter);
    }

    // Filter by locale
    if (localeFilter !== 'all') {
        filtered = filtered.filter(v => v.locale === localeFilter);
    }

    // Filter by search term
    if (searchTerm) {
        filtered = filtered.filter(v =>
            v.fullVersion.toLowerCase().includes(searchTerm) ||
            v.dateString.includes(searchTerm) ||
            v.locale.toLowerCase().includes(searchTerm) ||
            v.windowsFilename?.toLowerCase().includes(searchTerm) ||
            v.macFilename?.toLowerCase().includes(searchTerm)
        );
    }

    // Apply current sort
    filtered = sortVersions(filtered, currentSort.column, currentSort.ascending);

    displayVersions(filtered);
}

/**
 * Sort versions by a specific column
 */
function sortVersions(versions, column, ascending) {
    const sorted = [...versions].sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'version':
                aVal = a.fullVersion;
                bVal = b.fullVersion;
                break;
            case 'date':
                aVal = a.date.getTime();
                bVal = b.date.getTime();
                break;
            case 'major':
                aVal = parseInt(a.major);
                bVal = parseInt(b.major);
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
    });

    return sorted;
}

/**
 * Handle sort button click
 */
function handleSort(column) {
    // Toggle sort direction if clicking same column
    if (currentSort.column === column) {
        currentSort.ascending = !currentSort.ascending;
    } else {
        currentSort.column = column;
        currentSort.ascending = false; // Default to descending for new column
    }

    // Update sort icons
    document.querySelectorAll('.sortable').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (th.dataset.sort === column) {
            icon.textContent = currentSort.ascending ? '↑' : '↓';
        } else {
            icon.textContent = '↕';
        }
    });

    filterVersions();
}

// ============================================
// Utilities
// ============================================

/**
 * Format date for display
 */
function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

// ============================================
// Theme Toggle
// ============================================

/**
 * Initialize theme from localStorage or system preference
 */
function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) {
        setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
}

/**
 * Set the theme and update the toggle button UI
 */
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (icon && label) {
        if (theme === 'dark') {
            icon.textContent = '☀️';
            label.textContent = 'Light';
        } else {
            icon.textContent = '🌙';
            label.textContent = 'Dark';
        }
    }
}

// Apply theme immediately to avoid flash
initTheme();

// ============================================
// Event Listeners & Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            setTheme(e.matches ? 'dark' : 'light');
        }
    });

    // Load data
    loadLatestVersion();
    loadAllVersions();

    // Set up event listeners
    document.getElementById('search-input').addEventListener('input', filterVersions);
    document.getElementById('major-filter').addEventListener('change', filterVersions);
    document.getElementById('locale-filter').addEventListener('change', () => {
        // Reload latest version when locale changes
        loadLatestVersion();
        filterVersions();
    });

    // Set up sort handlers
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });
});
