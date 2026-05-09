/* ===== 版本戳 ===== */
const VERSION_STORAGE_KEY = 'hunterHutRuntimeVersion';

function buildVersionStamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getSessionVersion() {
    try {
        const stored = sessionStorage.getItem(VERSION_STORAGE_KEY);
        if (stored) return stored;
        const generated = buildVersionStamp();
        sessionStorage.setItem(VERSION_STORAGE_KEY, generated);
        return generated;
    } catch (err) {
        return buildVersionStamp();
    }
}

function getRuntimeVersion() {
    const url = new URL(window.location.href);
    const sessionVersion = getSessionVersion();
    if (url.searchParams.get('v') !== sessionVersion) {
        url.searchParams.set('v', sessionVersion);
        window.location.replace(url.toString());
        return null;
    }
    return sessionVersion;
}

function appendVersionToLinks(version) {
    const links = document.querySelectorAll('a[href$=".html"], a[href*=".html?"]');
    links.forEach(link => {
        const targetUrl = new URL(link.getAttribute('href'), window.location.href);
        targetUrl.searchParams.set('v', version);
        link.setAttribute('href', `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
    });
}

const APP_VERSION = getRuntimeVersion();
if (APP_VERSION) {
    appendVersionToLinks(APP_VERSION);
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        window.location.reload();
    }
});

/* ===== 时间戳工具 ===== */
function parseDatabaseTimestamp(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const utcLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
        ? `${text.replace(' ', 'T')}Z`
        : text;
    const date = new Date(utcLike);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDatabaseTimestampForBeijing(value) {
    const date = parseDatabaseTimestamp(value);
    if (!date) return '';
    try {
        return new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(date).replace(/\//g, '-');
    } catch (err) {
        return date.toLocaleString('zh-CN');
    }
}

/* ===== 数据库元信息 ===== */
function getDatabaseLastUpdated(db) {
    try {
        const tableInfo = db.exec('PRAGMA table_info(dishes)');
        if (!tableInfo.length || !tableInfo[0].values.some(row => String(row[1]) === 'updated_at')) return '';
        const result = db.exec('SELECT MAX(updated_at) AS last_updated FROM dishes');
        if (!result.length || !result[0].values.length) return '';
        return formatDatabaseTimestampForBeijing(result[0].values[0][0]);
    } catch (err) {
        return '';
    }
}

function updateDatabaseMeta(metaEl, lastUpdated) {
    if (!metaEl) return;
    metaEl.textContent = lastUpdated
        ? `数据库最后更新时间：${lastUpdated}`
        : '数据库最后更新时间：暂不可用';
}
