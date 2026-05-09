const dbFile = "data/menu.db";
let allRows = [];
let allColumns = [];
let currentQuery = "";
let currentSort = { key: null, direction: 'asc' };
let databaseLastUpdated = '';

const numericSortKeys = new Set(['id', 'rating', 'is_active']);

function updateDatabaseMeta() {
    const meta = document.getElementById('dbMeta');
    if (!meta) return;
    meta.textContent = databaseLastUpdated
        ? `数据库最后更新时间：${databaseLastUpdated}`
        : '数据库最后更新时间：暂不可用';
}

async function loadDatabase() {
    if (!APP_VERSION) return;

    const config = {
        locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}`
    };

    try {
        const SQL = await initSqlJs(config);
        const response = await fetch(`${dbFile}?v=${encodeURIComponent(APP_VERSION)}`, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`无法加载数据库文件 (${response.status} ${response.statusText})`);
        }

        const buffer = await response.arrayBuffer();
        const db = new SQL.Database(new Uint8Array(buffer));
        databaseLastUpdated = getDatabaseLastUpdated(db);
        updateDatabaseMeta();

        let result;
        try {
            result = db.exec("SELECT * FROM dishes");
        } catch (queryErr) {
            console.warn("查询全部字段失败，尝试仅查询基础字段", queryErr);
            result = db.exec("SELECT id, name, canteen, rating FROM dishes");
        }

        if (result.length > 0) {
            allColumns = result[0].columns;
            allRows = result[0].values;
            refreshTable();
            document.getElementById('status').style.display = 'none';
            document.getElementById('menuTable').style.display = 'table';
        } else {
            document.getElementById('status').textContent = "数据库为空或没有数据。";
        }

        db.close();

    } catch (err) {
        console.error(err);
        databaseLastUpdated = '';
        updateDatabaseMeta();
        document.getElementById('status').textContent = "加载失败: " + err.message;
        document.getElementById('status').className = "error";
    }
}

function getComparableValue(row, columns, sortKey) {
    const idx = columns.indexOf(sortKey);
    if (idx === -1) return null;

    const raw = row[idx];
    if (raw === null || raw === undefined || raw === '') return null;

    if (numericSortKeys.has(sortKey)) {
        const num = Number(raw);
        return Number.isNaN(num) ? null : num;
    }

    return String(raw).trim().toLowerCase();
}

function sortRows(rows, columns) {
    if (!currentSort.key || columns.indexOf(currentSort.key) === -1) {
        return rows;
    }

    const multiplier = currentSort.direction === 'asc' ? 1 : -1;
    const sortedRows = [...rows];

    sortedRows.sort((a, b) => {
        const av = getComparableValue(a, columns, currentSort.key);
        const bv = getComparableValue(b, columns, currentSort.key);

        const aEmpty = av === null;
        const bEmpty = bv === null;
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;

        if (typeof av === 'number' && typeof bv === 'number') {
            return (av - bv) * multiplier;
        }

        return String(av).localeCompare(String(bv), 'zh-CN', {
            numeric: true,
            sensitivity: 'base'
        }) * multiplier;
    });

    return sortedRows;
}

function getFilteredRows() {
    if (!currentQuery) {
        return [...allRows];
    }

    const q = currentQuery.toLowerCase();
    const cols = allColumns;
    const idxName = cols.indexOf('name');
    const idxCanteen = cols.indexOf('canteen');
    const idxMeal = cols.indexOf('meal_type');
    const idxLink = cols.indexOf('official_link');

    return allRows.filter(row => {
        const name = idxName !== -1 ? String(row[idxName] ?? '').toLowerCase() : '';
        const canteen = idxCanteen !== -1 ? String(row[idxCanteen] ?? '').toLowerCase() : '';
        const meal = idxMeal !== -1 ? String(row[idxMeal] ?? '').toLowerCase() : '';
        const link = idxLink !== -1 ? String(row[idxLink] ?? '').toLowerCase() : '';
        return name.includes(q) || canteen.includes(q) || meal.includes(q) || link.includes(q);
    });
}

function refreshTable() {
    if (!allRows.length || !allColumns.length) return;
    const filteredRows = getFilteredRows();
    const sortedRows = sortRows(filteredRows, allColumns);
    renderTable({ columns: allColumns, values: sortedRows });
}

function updateSortHeaderUI() {
    const headers = document.querySelectorAll('#menuTable th[data-sort-key]');
    headers.forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        th.setAttribute('aria-sort', 'none');

        const sortKey = th.dataset.sortKey;
        if (currentSort.key === sortKey) {
            if (currentSort.direction === 'asc') {
                th.classList.add('sort-asc');
                th.setAttribute('aria-sort', 'ascending');
            } else {
                th.classList.add('sort-desc');
                th.setAttribute('aria-sort', 'descending');
            }
        }
    });
}

function toggleSort(sortKey) {
    if (currentSort.key === sortKey) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort = { key: sortKey, direction: 'asc' };
    }

    refreshTable();
    updateSortHeaderUI();
}

function initSortableHeaders() {
    const headers = document.querySelectorAll('#menuTable th[data-sort-key]');
    headers.forEach(th => {
        th.classList.add('sortable-header');
        th.addEventListener('click', () => {
            toggleSort(th.dataset.sortKey);
        });
    });

    updateSortHeaderUI();
}

function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    const cols = data.columns;
    const rows = data.values;

    const getVal = (row, colName) => {
        const idx = cols.indexOf(colName);
        return idx !== -1 ? row[idx] : null;
    };

    rows.forEach(row => {
        const id = getVal(row, 'id');
        const name = getVal(row, 'name');
        const canteen = getVal(row, 'canteen');
        const rating = getVal(row, 'rating');

        let mealType = getVal(row, 'meal_type') || "午餐,晚餐";
        let officialLink = getVal(row, 'official_link') || "";
        let isActive = getVal(row, 'is_active');
        if (isActive === null) isActive = 1;

        const tr = document.createElement('tr');

        if (!isActive) {
            tr.classList.add('status-closed-row');
        }

        const mealsHtml = mealType.split(/[，,、/;；]/g)
            .map(m => `<span class="meal-tag">${m.trim()}</span>`)
            .join('');

        const statusHtml = isActive
            ? `<span class="status-badge badge-active">营业</span>`
            : `<span class="status-badge badge-closed">停业</span>`;

        let linkHtml = '<span style="color:#ccc">-</span>';
        if (officialLink) {
            const url = officialLink.startsWith('http') ? officialLink : `http://${officialLink}`;
            linkHtml = `<a href="${url}" target="_blank" class="official-link">查看</a>`;
        }

        tr.innerHTML = `
                <td>${id}</td>
                <td>${name}</td>
                <td>${canteen}</td>
                <td>${parseFloat(rating).toFixed(1)}</td>
                <td>${mealsHtml}</td>
                <td>${statusHtml}</td>
                <td>${linkHtml}</td>
            `;
        tbody.appendChild(tr);
    });

    const hint = document.getElementById('resultHint');
    if (currentQuery) {
        hint.textContent = `找到 ${rows.length} 条匹配结果：${currentQuery}`;
    } else {
        hint.textContent = rows.length > 0 ? `共 ${rows.length} 条菜品记录` : '';
    }
}

function escapeCsvCell(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function toCsv(columns, rows) {
    const headerLine = columns.map(escapeCsvCell).join(',');
    const dataLines = rows.map(row => columns.map((_, idx) => escapeCsvCell(row[idx])).join(','));
    return [headerLine, ...dataLines].join('\r\n');
}

function buildCsvFileName() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `menu_db_${stamp}.csv`;
}

function downloadDatabaseCsv() {
    if (!allColumns.length || !allRows.length) {
        alert('数据库尚未加载完成，或当前没有可导出的数据。');
        return;
    }

    try {
        const csv = toCsv(allColumns, allRows);
        const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = buildCsvFileName();
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('导出 CSV 失败:', err);
        alert(`导出失败：${err.message}`);
    }
}

function applySearch() {
    currentQuery = document.getElementById('searchInput').value.trim();
    if (!allRows.length) return;
    refreshTable();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentQuery = '';
    if (allRows.length) {
        refreshTable();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initSortableHeaders();
    const input = document.getElementById('searchInput');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applySearch();
    });
});

window.onload = loadDatabase;
