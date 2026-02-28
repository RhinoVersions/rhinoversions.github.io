const test = require('node:test');
const assert = require('node:assert');
const {
    parseMarkdownLinks,
    parseVersionFromFilename,
    compareFullVersions,
    formatDate,
    resolveTheme,
    getVersionBuildKey,
    sanitizeUrl
} = require('../assets/js/script.js');

// Mock window for resolveTheme
global.window = {
    matchMedia: (query) => ({
        matches: query.includes('dark'), // Mocking prefers-color-scheme: dark
    })
};

test('parseMarkdownLinks', async (t) => {
    await t.test('should parse valid links', () => {
        const markdown = '- [rhino_en-us_8.24.25281.15001.exe](https://example.com/win.exe)\n- [rhino_8.25.25328.11002.dmg](https://example.com/mac.dmg)';
        const links = parseMarkdownLinks(markdown);
        assert.strictEqual(links.length, 2);
        assert.strictEqual(links[0].filename, 'rhino_en-us_8.24.25281.15001.exe');
        assert.strictEqual(links[0].url, 'https://example.com/win.exe');
        assert.strictEqual(links[1].filename, 'rhino_8.25.25328.11002.dmg');
        assert.strictEqual(links[1].url, 'https://example.com/mac.dmg');
    });

    await t.test('should return empty array for invalid markdown', () => {
        const markdown = 'No links here';
        const links = parseMarkdownLinks(markdown);
        assert.strictEqual(links.length, 0);
    });
});

test('parseVersionFromFilename', async (t) => {
    await t.test('should parse Windows filename', () => {
        const filename = 'rhino_en-us_8.24.25281.15001.exe';
        const info = parseVersionFromFilename(filename);
        assert.strictEqual(info.major, '8');
        assert.strictEqual(info.minor, '24');
        assert.strictEqual(info.locale, 'en-us');
        assert.strictEqual(info.platform, 'windows');
        assert.strictEqual(info.fullVersion, '8.24.25281.15001');
        // 25281 -> 2025 day 281 -> 2025-10-08
        assert.strictEqual(info.dateString, '2025-10-08');
    });

    await t.test('should parse Mac filename (no locale)', () => {
        const filename = 'rhino_8.25.25328.11002.dmg';
        const info = parseVersionFromFilename(filename);
        assert.strictEqual(info.major, '8');
        assert.strictEqual(info.minor, '25');
        assert.strictEqual(info.locale, 'multi');
        assert.strictEqual(info.platform, 'mac');
        // 25328 -> 2025 day 328 -> 2025-11-24
        assert.strictEqual(info.dateString, '2025-11-24');
    });

    await t.test('should return null for invalid filename', () => {
        const filename = 'invalid_file.txt';
        const info = parseVersionFromFilename(filename);
        assert.strictEqual(info, null);
    });
});

test('compareFullVersions', async (t) => {
    await t.test('should correctly compare versions', () => {
        assert.ok(compareFullVersions('8.25.25328.11002', '8.24.25281.15001') > 0);
        assert.ok(compareFullVersions('8.24.25281.15001', '8.25.25328.11002') < 0);
        assert.strictEqual(compareFullVersions('8.24.25281.15001', '8.24.25281.15001'), 0);
        assert.ok(compareFullVersions('8.24.25281.15002', '8.24.25281.15001') > 0);
    });
});

test('formatDate', async (t) => {
    await t.test('should format date correctly', () => {
        const date = new Date(2025, 9, 8); // Oct 8, 2025
        const formatted = formatDate(date, 'long');
        // Using includes to be resilient to different space characters or tiny Intl variations
        assert.ok(formatted.includes('October'));
        assert.ok(formatted.includes('8'));
        assert.ok(formatted.includes('2025'));
    });
});

test('resolveTheme', async (t) => {
    await t.test('should resolve explicit themes', () => {
        assert.strictEqual(resolveTheme('light'), 'light');
        assert.strictEqual(resolveTheme('dark'), 'dark');
    });

    await t.test('should resolve system theme', () => {
        // Our mock matchMedia returns matches: true for 'dark'
        assert.strictEqual(resolveTheme('system'), 'dark');
    });
});

test('getVersionBuildKey', async (t) => {
    await t.test('should return major.minor', () => {
        assert.strictEqual(getVersionBuildKey('8.24.25281.15001'), '8.24');
        assert.strictEqual(getVersionBuildKey('7.31.25281.15001'), '7.31');
    });
});

test('sanitizeUrl', async (t) => {
    await t.test('should allow valid https URLs', () => {
        const url = 'https://files.mcneel.com/rhino/8/mac/releases/rhino_8.28.26041.11002.dmg';
        assert.strictEqual(sanitizeUrl(url), url);
    });

    await t.test('should allow valid http URLs', () => {
        const url = 'http://example.com/file.exe';
        assert.strictEqual(sanitizeUrl(url), url);
    });

    await t.test('should allow relative URLs and query params', () => {
        assert.strictEqual(sanitizeUrl('?version=8.28'), '?version=8.28');
        assert.strictEqual(sanitizeUrl('/path/to/resource'), '/path/to/resource');
        assert.strictEqual(sanitizeUrl('#anchor'), '#anchor');
    });

    await t.test('should block javascript: URLs', () => {
        const malicious = 'javascript:alert("XSS")';
        assert.strictEqual(sanitizeUrl(malicious), 'javascript:void(0)');
    });

    await t.test('should block data: URLs', () => {
        const malicious = 'data:text/html,<script>alert(1)</script>';
        assert.strictEqual(sanitizeUrl(malicious), 'javascript:void(0)');
    });

    await t.test('should block vbscript: URLs', () => {
        const malicious = 'vbscript:msgbox("XSS")';
        assert.strictEqual(sanitizeUrl(malicious), 'javascript:void(0)');
    });

    await t.test('should escape HTML in valid URLs', () => {
        const urlWithSpecialChars = 'https://example.com/path?param=value&other="quote"';
        const expected = 'https://example.com/path?param=value&amp;other=&quot;quote&quot;';
        assert.strictEqual(sanitizeUrl(urlWithSpecialChars), expected);
    });
});
