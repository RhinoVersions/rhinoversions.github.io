// Heroicons SVG strings — matches RhinoPackages ThemeToggle icons exactly
const THEME_ICONS = {
    system: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" /></svg>',
    light: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>',
    dark: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>'
};

// Platform icons for download buttons
const PLATFORM_ICONS = {
    windows: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.8z"/></svg>',
    mac: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.22.15-2.19 1.28-2.17 3.83.03 3.02 2.65 4.03 2.68 4.04l-.06.2M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>'
};

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
let expandedVersionCards = new Set();
let deepLinkState = {
    version: null,
    locale: null,
    hasAutoScrolled: false
};

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
 * Fetch with localStorage cache
 */
const CACHE_KEY_PREFIX = 'rhino_versions_cache_';
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchWithCache(url) {
    const cacheKey = CACHE_KEY_PREFIX + url;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_EXPIRY_MS) {
                return data;
            }
        }
    } catch (e) {
        console.warn('Cache retrieval failed:', e);
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();

    try {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: text }));
    } catch (e) {
        console.warn('Failed to cache data:', e);
    }
    return text;
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
    return await fetchWithCache(url);
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
        filterVersions();

        // Show cards, hide loading
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
 * Display versions as expandable cards
 */
function displayVersions(versions) {
    const listEl = document.getElementById('versions-list');
    const countEl = document.getElementById('version-count');
    const localeFilter = document.getElementById('locale-filter').value;

    listEl.innerHTML = '';

    versions.forEach((versionGroup, index) => {
        const card = document.createElement('article');
        card.className = 'version-card glass-card';
        card.style.animationDelay = `${index * 0.02}s`;
        card.style.animation = 'fadeInUp 0.5s ease both';
        card.dataset.version = versionGroup.fullVersion;

        const isDeepLinkedCard = isDeepLinkedVersion(versionGroup);
        if (isDeepLinkedCard) {
            card.classList.add('deep-linked-card');
        }

        const deepLinkLocale = pickDeepLinkLocale(versionGroup, localeFilter);
        const deepLinkHref = buildVersionDeepLink(versionGroup.fullVersion, deepLinkLocale);
        const isExpanded = expandedVersionCards.has(versionGroup.fullVersion) || isDeepLinkedCard;

        if (isExpanded) {
            expandedVersionCards.add(versionGroup.fullVersion);
            card.classList.add('expanded');
        }

        card.innerHTML = `
            <div class="version-card-header" role="button" tabindex="0" aria-expanded="${isExpanded}">
                <div class="version-card-main">
                    <a href="${deepLinkHref}" class="version-link"><span class="version-number">${versionGroup.fullVersion}</span></a>
                    <span class="major-badge">Rhino ${versionGroup.major}</span>
                </div>
                <div class="version-card-meta">
                    <span class="version-date">${formatDate(versionGroup.date, 'long')}</span>
                    <span class="version-accordion-icon">${isExpanded ? '−' : '+'}</span>
                </div>
            </div>
            <div class="version-card-body" style="display: ${isExpanded ? 'block' : 'none'};">
                ${buildVersionCardRows(versionGroup, localeFilter)}
            </div>
        `;

        const headerButton = card.querySelector('.version-card-header');
        const body = card.querySelector('.version-card-body');
        const icon = card.querySelector('.version-accordion-icon');
        const versionLink = card.querySelector('.version-link');

        versionLink.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        const toggleExpanded = () => {
            const expanded = card.classList.toggle('expanded');
            headerButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            body.style.display = expanded ? 'block' : 'none';
            icon.textContent = expanded ? '−' : '+';

            if (expanded) {
                expandedVersionCards.add(versionGroup.fullVersion);
            } else {
                expandedVersionCards.delete(versionGroup.fullVersion);
            }
        };

        headerButton.addEventListener('click', toggleExpanded);
        headerButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleExpanded();
            }
        });

        listEl.appendChild(card);
    });

    countEl.textContent = `Showing ${versions.length} version${versions.length !== 1 ? 's' : ''}`;
    scrollToDeepLinkedRowIfNeeded();
}

/**
 * Filter versions based on search, major version, and locale
 */
function filterVersions() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const majorFilter = document.getElementById('major-filter').value;
    const localeFilter = document.getElementById('locale-filter').value;

    let filtered = groupVersions(allVersions);

    // Filter by major version
    if (majorFilter !== 'all') {
        filtered = filtered.filter(v => v.major === majorFilter);
    }

    // Filter by locale
    if (localeFilter !== 'all') {
        filtered = filtered.filter(v => v.entries.some(entry => entry.locale === localeFilter));
    }

    // Filter by search term
    if (searchTerm) {
        filtered = filtered.filter(v =>
            v.fullVersion.toLowerCase().includes(searchTerm) ||
            v.buildKey.toLowerCase().includes(searchTerm) ||
            v.dateString.includes(searchTerm) ||
            v.entries.some(entry =>
                entry.fullVersion.toLowerCase().includes(searchTerm) ||
                entry.locale.toLowerCase().includes(searchTerm) ||
                entry.windowsFilename?.toLowerCase().includes(searchTerm) ||
                entry.macFilename?.toLowerCase().includes(searchTerm)
            )
        );
    }

    // Apply current sort
    filtered = sortVersions(filtered, currentSort.column, currentSort.ascending);

    displayVersions(filtered);
}

/**
 * Group locale/platform entries under each unique version
 */
function groupVersions(versions) {
    const groupedMap = new Map();

    versions.forEach(version => {
        const key = getVersionBuildKey(version.fullVersion);
        if (!groupedMap.has(key)) {
            groupedMap.set(key, {
                buildKey: key,
                fullVersion: version.fullVersion,
                major: version.major,
                date: version.date,
                dateString: version.dateString,
                entriesByLocale: new Map()
            });
        }

        const group = groupedMap.get(key);

        // Keep a representative latest build for the grouped major.minor card
        if (compareFullVersions(version.fullVersion, group.fullVersion) > 0) {
            group.fullVersion = version.fullVersion;
            group.date = version.date;
            group.dateString = version.dateString;
        }

        if (!group.entriesByLocale.has(version.locale)) {
            group.entriesByLocale.set(version.locale, {
                fullVersion: version.fullVersion,
                locale: version.locale,
                windowsUrl: null,
                macUrl: null,
                windowsFilename: null,
                macFilename: null,
                windowsVersion: null,
                macVersion: null
            });
        }

        const entry = group.entriesByLocale.get(version.locale);

        if (version.windowsUrl && (!entry.windowsVersion || compareFullVersions(version.fullVersion, entry.windowsVersion) > 0)) {
            entry.windowsUrl = version.windowsUrl;
            entry.windowsFilename = version.windowsFilename;
            entry.windowsVersion = version.fullVersion;
        }

        if (version.macUrl && (!entry.macVersion || compareFullVersions(version.fullVersion, entry.macVersion) > 0)) {
            entry.macUrl = version.macUrl;
            entry.macFilename = version.macFilename;
            entry.macVersion = version.fullVersion;
        }

        if (compareFullVersions(version.fullVersion, entry.fullVersion) > 0) {
            entry.fullVersion = version.fullVersion;
        }
    });

    return Array.from(groupedMap.values()).map(group => {
        const entries = Array.from(group.entriesByLocale.values())
            .map(entry => ({
                fullVersion: entry.fullVersion,
                locale: entry.locale,
                windowsUrl: entry.windowsUrl,
                macUrl: entry.macUrl,
                windowsFilename: entry.windowsFilename,
                macFilename: entry.macFilename
            }))
            .filter(entry => entry.windowsUrl || entry.macUrl)
            .sort((a, b) => a.locale.localeCompare(b.locale));

        return {
            buildKey: group.buildKey,
            fullVersion: group.fullVersion,
            major: group.major,
            date: group.date,
            dateString: group.dateString,
            entries
        };
    });
}

/**
 * Build expanded accordion body rows (locale + platform downloads)
 */
function buildVersionCardRows(versionGroup, localeFilter) {
    const macFallback = versionGroup.entries.find(entry => entry.locale === 'multi' && entry.macUrl);
    const localizedEntries = versionGroup.entries
        .filter(entry => entry.locale !== 'multi')
        .sort((a, b) => a.locale.localeCompare(b.locale));

    const rows = [];

    if (localizedEntries.length > 0) {
        localizedEntries.forEach(entry => {
            let buttons = '';
            if (entry.windowsUrl) {
                buttons += `<a href="${entry.windowsUrl}" class="table-download-btn" target="_blank" rel="noopener noreferrer">${PLATFORM_ICONS.windows}<span class="label-full">Windows</span><span class="label-short">Win</span></a>`;
            }
            if (entry.macUrl || macFallback?.macUrl) {
                buttons += `<a href="${entry.macUrl || macFallback.macUrl}" class="table-download-btn" target="_blank" rel="noopener noreferrer">${PLATFORM_ICONS.mac}Mac</a>`;
            }

            rows.push(`
                <div class="version-card-row">
                    <span class="locale-badge">${entry.locale.toUpperCase()}</span>
                    <div class="download-buttons-cell">${buttons}</div>
                </div>
            `);
        });
    } else {
        versionGroup.entries
            .sort((a, b) => a.locale.localeCompare(b.locale))
            .forEach(entry => {
                let buttons = '';
                if (entry.windowsUrl) {
                    buttons += `<a href="${entry.windowsUrl}" class="table-download-btn" target="_blank" rel="noopener noreferrer">${PLATFORM_ICONS.windows}<span class="label-full">Windows</span><span class="label-short">Win</span></a>`;
                }
                if (entry.macUrl) {
                    buttons += `<a href="${entry.macUrl}" class="table-download-btn" target="_blank" rel="noopener noreferrer">${PLATFORM_ICONS.mac}Mac</a>`;
                }

                const localeLabel = entry.locale === 'multi' ? 'MULTILINGUAL' : entry.locale.toUpperCase();
                rows.push(`
                    <div class="version-card-row">
                        <span class="locale-badge">${localeLabel}</span>
                        <div class="download-buttons-cell">${buttons}</div>
                    </div>
                `);
            });
    }

    if (rows.length === 0) {
        return '<p class="version-card-empty">No downloads for this version.</p>';
    }

    return rows.join('');
}

/**
 * Pick locale used in generated deep-link URL for a version card
 */
function pickDeepLinkLocale(versionGroup, localeFilter) {
    if (localeFilter !== 'all' && versionGroup.entries.some(entry => entry.locale === localeFilter)) {
        return localeFilter;
    }

    const firstNonMulti = versionGroup.entries.find(entry => entry.locale !== 'multi');
    if (firstNonMulti) return firstNonMulti.locale;
    return versionGroup.entries[0]?.locale || 'all';
}

/**
 * Group by major.minor so Windows/Mac rows stay together in one card
 */
function getVersionBuildKey(fullVersion) {
    const parts = fullVersion.split('.');
    return parts.slice(0, 2).join('.');
}

/**
 * Compare semantic-ish Rhino build versions, e.g. 8.12.26043.12345
 */
function compareFullVersions(a, b) {
    const aParts = a.split('.').map(part => parseInt(part, 10) || 0);
    const bParts = b.split('.').map(part => parseInt(part, 10) || 0);
    const maxLen = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLen; i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) return aVal - bVal;
    }

    return 0;
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

// ============================================
// Utilities
// ============================================

/**
 * Debounce function to limit rate of execution
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Format date for display
 */
function formatDate(date, monthStyle = 'long') {
    return new Intl.DateTimeFormat('en-US', {
        year: monthStyle === 'short' ? '2-digit' : 'numeric',
        month: monthStyle,
        day: 'numeric'
    }).format(date);
}

/**
 * Parse deep-link parameters from URL (?version=...&locale=...)
 */
function parseDeepLinkFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const versionParam = params.get('version')?.trim() || null;
    const localeParam = params.get('locale')?.trim().toLowerCase() || null;
    const normalizedVersion = versionParam?.replace(/[^\d.]/g, '') || null;
    // Accept partial versions (e.g. 8.18) and full versions (e.g. 8.18.25100.11001)
    const versionPattern = /^\d+(\.\d+){1,3}$/;

    return {
        version: normalizedVersion && versionPattern.test(normalizedVersion) ? normalizedVersion : null,
        locale: localeParam
    };
}

/**
 * Apply deep-link values to initial filters so target row is visible
 */
function applyDeepLinkToFilters() {
    if (!deepLinkState.version) return;

    const searchInput = document.getElementById('search-input');
    const majorFilter = document.getElementById('major-filter');
    const localeFilter = document.getElementById('locale-filter');

    searchInput.value = deepLinkState.version;

    const major = deepLinkState.version.split('.')[0];
    if (majorFilter.querySelector(`option[value="${major}"]`)) {
        majorFilter.value = major;
    }

    if (deepLinkState.locale && localeFilter.querySelector(`option[value="${deepLinkState.locale}"]`)) {
        localeFilter.value = deepLinkState.locale;
    } else {
        localeFilter.value = 'all';
    }
}

/**
 * Build a shareable deep-link URL for a specific version+locale card
 */
function buildVersionDeepLink(version, locale) {
    const url = new URL(window.location.href);
    url.searchParams.set('version', version);
    url.searchParams.set('locale', locale);
    return url.toString();
}

/**
 * Check whether a version card matches the currently requested deep-link
 */
function isDeepLinkedVersion(versionEntry) {
    if (!deepLinkState.version) return false;

    const versionMatches =
        versionMatchesQuery(versionEntry.fullVersion, deepLinkState.version) ||
        versionMatchesQuery(versionEntry.buildKey, deepLinkState.version) ||
        versionEntry.entries.some(entry => versionMatchesQuery(entry.fullVersion, deepLinkState.version));
    const localeMatches = !deepLinkState.locale || versionEntry.entries.some(entry => entry.locale === deepLinkState.locale);
    return versionMatches && localeMatches;
}

/**
 * Match deep-link version queries as exact or dotted-prefix (e.g. 8.18 matches 8.18.x.x)
 */
function versionMatchesQuery(value, query) {
    return value === query || value.startsWith(`${query}.`);
}

/**
 * Auto-scroll once to the deep-linked card after render
 */
function scrollToDeepLinkedRowIfNeeded() {
    if (!deepLinkState.version || deepLinkState.hasAutoScrolled) return;

    const targetRow = document.querySelector('.deep-linked-card');
    if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        deepLinkState.hasAutoScrolled = true;
    }
}

// ============================================
// Theme Toggle
// ============================================

/**
 * Resolve the effective display theme (system → actual dark/light)
 */
function resolveTheme(theme) {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
}

/**
 * Initialize theme from localStorage (default: 'system')
 */
function initTheme() {
    const saved = localStorage.getItem('theme') || 'system';
    applyTheme(saved);
}

/**
 * Apply theme to DOM and update toggle button UI
 */
function applyTheme(theme) {
    const effective = resolveTheme(theme);
    document.documentElement.setAttribute('data-theme', effective);
    localStorage.setItem('theme', theme);

    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (icon && label) {
        icon.innerHTML = THEME_ICONS[theme] || THEME_ICONS.system;
        if (theme === 'system') {
            label.textContent = 'System';
        } else if (theme === 'dark') {
            label.textContent = 'Dark';
        } else {
            label.textContent = 'Light';
        }
    }
}

// Apply theme immediately to avoid flash — also called inline in <head>
initTheme();

// ============================================
// Contributors
// ============================================

async function loadContributors() {
    const container = document.getElementById('contributors');
    if (!container) return;

    try {
        const response = await fetch(`https://api.github.com/repos/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contributors`);
        if (!response.ok) throw new Error('Failed to fetch contributors');

        const contributors = await response.json();

        contributors.forEach(user => {
            // Filter out bots if needed, usually they have type 'Bot'
            if (user.type === 'Bot') return;

            const bubble = document.createElement('a');
            bubble.href = user.html_url;
            bubble.className = 'contributor-bubble';
            bubble.target = '_blank';
            bubble.rel = 'noopener noreferrer';
            bubble.title = user.login;

            const img = document.createElement('img');
            img.src = user.avatar_url;
            img.alt = user.login;
            img.loading = 'lazy';

            bubble.appendChild(img);
            container.appendChild(bubble);
        });
    } catch (error) {
        console.error('Error loading contributors:', error);
        // Fail silently - section just stays empty
    }
}

// ============================================
// Event Listeners & Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    deepLinkState = parseDeepLinkFromUrl();
    applyDeepLinkToFilters();

    // 3-way theme toggle: system → light → dark → system
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const current = localStorage.getItem('theme') || 'system';
            const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
            applyTheme(next);
        });
    }

    // React to system preference changes when in 'system' mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const current = localStorage.getItem('theme') || 'system';
        if (current === 'system') applyTheme('system');
    });

    // Load data
    loadLatestVersion();
    loadAllVersions();
    loadContributors();

    // Set up event listeners
    document.getElementById('search-input').addEventListener('input', debounce(filterVersions, 300));
    document.getElementById('major-filter').addEventListener('change', filterVersions);
    document.getElementById('locale-filter').addEventListener('change', () => {
        // Reload latest version when locale changes
        loadLatestVersion();
        filterVersions();
    });

});
