const API_BASE = 'https://api-home.u365043.nyat.app:19703';

const STATUS_LABELS = {
    '待评测': '待评测',
    '正在评测': '正在评测',
    '已评测': '已评测',
    '已有重复': '已有重复',
    '何意味': '何意味',
};

const STATUS_CSS = {
    '待评测': 'status-badge--pending',
    '正在评测': 'status-badge--reviewing',
    '已评测': 'status-badge--done',
    '已有重复': 'status-badge--duplicate',
    '何意味': 'status-badge--special',
};

function isSpecialLink(link) {
    if (!link) return false;
    return /statics\/special\/.*\.html$/i.test(link);
}

function getDisplayStatus(w) {
    if (isSpecialLink(w.official_link)) return '何意味';
    return w.status;
}

let wishes = [];
let currentTab = 'pool';
let currentView = 'card';
let showSpecial = false;
let adminPassword = null;

const SORT_MODES = [
    { key: 'time_desc', label: '排序: 时间 ↓' },
    { key: 'time_asc', label: '排序: 时间 ↑' },
    { key: 'name_asc', label: '排序: 名称 A→Z' },
    { key: 'name_desc', label: '排序: 名称 Z→A' },
    { key: 'likes_desc', label: '排序: 点赞 ↓' },
    { key: 'likes_asc', label: '排序: 点赞 ↑' },
];
let sortIndex = 0;

const LIKED_STORAGE_KEY = 'wish_liked_ids_v1';

function getLikedSet() {
    try {
        const raw = localStorage.getItem(LIKED_STORAGE_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.map(Number) : []);
    } catch {
        return new Set();
    }
}

function setLikedLocal(id, liked) {
    const s = getLikedSet();
    if (liked) s.add(Number(id)); else s.delete(Number(id));
    try {
        localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...s]));
    } catch {
        // ignore quota errors
    }
}

function syncLikedFromServer(list) {
    const s = getLikedSet();
    list.forEach(w => {
        if (w.liked) s.add(Number(w.id));
    });
    try {
        localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...s]));
    } catch {
        // ignore
    }
}

function isLiked(id) {
    return getLikedSet().has(Number(id));
}

/* ---- DOM Ref cache ---- */

const $tabPool = document.getElementById('tabPool');
const $tabSubmit = document.getElementById('tabSubmit');
const $panelPool = document.getElementById('panelPool');
const $panelSubmit = document.getElementById('panelSubmit');
const $wishGrid = document.getElementById('wishGrid');
const $emptyState = document.getElementById('emptyState');
const $loading = document.getElementById('loading');
const $filterInput = document.getElementById('filterSubmitter');
const $filterStatus = document.getElementById('filterStatus');
const $form = document.getElementById('wishForm');
const $formFeedback = document.getElementById('formFeedback');
const $adminToggle = document.getElementById('adminToggle');
const $adminLogin = document.getElementById('adminLogin');
const $adminPasswordInput = document.getElementById('adminPasswordInput');
const $adminLoginBtn = document.getElementById('adminLoginBtn');
const $adminIndicator = document.getElementById('adminIndicator');
const $adminLogoutBtn = document.getElementById('adminLogoutBtn');
const $viewModeToggle = document.getElementById('viewModeToggle');
const $showSpecialToggle = document.getElementById('showSpecialToggle');
const $sortToggle = document.getElementById('sortToggle');
const $wishTableWrap = document.getElementById('wishTableWrap');
const $wishTableBody = document.getElementById('wishTableBody');

/* ---- Tab Switching ---- */

function switchTab(tab) {
    currentTab = tab;
    $tabPool.classList.toggle('active', tab === 'pool');
    $tabSubmit.classList.toggle('active', tab === 'submit');
    $panelPool.classList.toggle('active', tab === 'pool');
    $panelSubmit.classList.toggle('active', tab === 'submit');
}

$tabPool.addEventListener('click', () => switchTab('pool'));
$tabSubmit.addEventListener('click', () => switchTab('submit'));

/* ---- API helpers ---- */

async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function apiPut(path, body) {
    const res = await fetch(API_BASE + path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function apiDelete(path, body) {
    const res = await fetch(API_BASE + path, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function apiGet(path) {
    const res = await fetch(API_BASE + path);
    return res.json();
}

/* ---- Load & Render ---- */

async function loadWishes() {
    $loading.style.display = 'block';
    $wishGrid.innerHTML = '';
    $wishTableBody.innerHTML = '';
    $wishTableWrap.style.display = 'none';
    $emptyState.style.display = 'none';

    try {
        const qs = $filterInput.value.trim() ? `?submitter=${encodeURIComponent($filterInput.value.trim())}` : '';
        const data = await apiGet('/api/wishes' + qs);
        if (data.success) {
            wishes = data.wishes;
            syncLikedFromServer(wishes);
            renderWishes();
        } else {
            $loading.textContent = '加载失败: ' + (data.message || '未知错误');
        }
    } catch (e) {
        $loading.textContent = '无法连接服务器，请检查 NAS 后端是否运行。';
        $loading.style.display = 'block';
    }
}

function renderWishes() {
    $wishGrid.innerHTML = '';
    $wishTableBody.innerHTML = '';
    $loading.style.display = 'none';

    const statusFilter = $filterStatus.value;
    let filtered;
    if (statusFilter === '何意味') {
        filtered = wishes.filter(w => isSpecialLink(w.official_link));
    } else if (statusFilter) {
        filtered = wishes.filter(w => w.status === statusFilter);
    } else {
        filtered = wishes;
    }

    // 默认屏蔽"何意味"恶搞许愿；按钮开启或用户主动筛选"何意味"时除外
    if (!showSpecial && statusFilter !== '何意味') {
        filtered = filtered.filter(w => !isSpecialLink(w.official_link));
    }

    filtered = sortWishes(filtered);

    document.getElementById('wishCount').textContent = filtered.length;

    const showAsTable = currentView === 'table';
    $wishGrid.style.display = showAsTable ? 'none' : '';
    $wishTableWrap.style.display = showAsTable ? '' : 'none';

    if (filtered.length === 0) {
        $emptyState.style.display = 'block';
        return;
    }

    $emptyState.style.display = 'none';

    if (showAsTable) {
        renderWishTable(filtered);
        return;
    }

    filtered.forEach(w => {
        const card = document.createElement('div');
        card.className = 'wish-card';
        card.dataset.wishId = w.id;
        card.innerHTML = buildWishCardHTML(w);
        $wishGrid.appendChild(card);

        wireLikeButton(card, w);

        if (adminPassword) {
            wireAdminControls(card, w);
        }
    });
}

function renderWishTable(list) {
    const frag = document.createDocumentFragment();
    list.forEach(w => {
        const status = getDisplayStatus(w);
        const tr = document.createElement('tr');
        tr.dataset.wishId = w.id;
        const linkCell = w.official_link
            ? `<a class="wish-table-link" href="${esc(w.official_link)}" target="_blank" rel="noopener noreferrer">查看</a>`
            : '<span class="wish-table-empty">—</span>';
        const liked = isLiked(w.id);
        const likeCount = Number(w.likes || 0);
        const likeCellHTML = `
            <button class="wish-like-btn wish-like-btn--table${liked ? ' liked' : ''}" type="button" aria-pressed="${liked ? 'true' : 'false'}" aria-label="点赞">
                <span class="wish-like-icon" aria-hidden="true">${liked ? '♥' : '♡'}</span>
                <span class="wish-like-count">${likeCount}</span>
            </button>`;
        tr.innerHTML = `
            <td data-label="菜品" class="wish-table-name">${esc(w.name)}</td>
            <td data-label="食堂">${esc(w.canteen)}</td>
            <td data-label="位置">${w.location ? esc(w.location) : '<span class="wish-table-empty">—</span>'}</td>
            <td data-label="价格">${w.price ? esc(w.price) : '<span class="wish-table-empty">—</span>'}</td>
            <td data-label="许愿人">${esc(w.submitter)}</td>
            <td data-label="状态"><span class="status-badge ${STATUS_CSS[status] || 'status-badge--pending'}">${status}</span></td>
            <td data-label="点赞">${likeCellHTML}</td>
            <td data-label="时间" class="wish-table-time">${formatTime(w.created_at)}</td>
            <td data-label="链接">${linkCell}</td>
        `;
        frag.appendChild(tr);
        wireLikeButton(tr, w);
    });
    $wishTableBody.appendChild(frag);
}

function setViewMode(mode) {
    currentView = mode === 'table' ? 'table' : 'card';
    $viewModeToggle.textContent = currentView === 'table' ? '卡片模式' : '表格模式';
    $viewModeToggle.setAttribute('aria-pressed', currentView === 'table' ? 'true' : 'false');
    $viewModeToggle.classList.toggle('view-mode-toggle--active', currentView === 'table');
    renderWishes();
}

$viewModeToggle.addEventListener('click', () => {
    setViewMode(currentView === 'table' ? 'card' : 'table');
});

function setShowSpecial(on) {
    showSpecial = !!on;
    $showSpecialToggle.textContent = showSpecial ? '隐藏恶搞' : '显示恶搞';
    $showSpecialToggle.setAttribute('aria-pressed', showSpecial ? 'true' : 'false');
    $showSpecialToggle.classList.toggle('view-mode-toggle--active', showSpecial);
    renderWishes();
}

$showSpecialToggle.addEventListener('click', () => {
    setShowSpecial(!showSpecial);
});

function sortWishes(list) {
    const mode = SORT_MODES[sortIndex] || SORT_MODES[0];
    const arr = list.slice();
    switch (mode.key) {
        case 'time_desc':
            arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
            break;
        case 'time_asc':
            arr.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
            break;
        case 'name_asc':
            arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'));
            break;
        case 'name_desc':
            arr.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'zh-CN'));
            break;
        case 'likes_desc':
            arr.sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0));
            break;
        case 'likes_asc':
            arr.sort((a, b) => Number(a.likes || 0) - Number(b.likes || 0));
            break;
    }
    return arr;
}

function applySortLabel() {
    const mode = SORT_MODES[sortIndex] || SORT_MODES[0];
    $sortToggle.textContent = mode.label;
}

$sortToggle.addEventListener('click', () => {
    sortIndex = (sortIndex + 1) % SORT_MODES.length;
    applySortLabel();
    renderWishes();
});

function buildWishCardHTML(w) {
    const time = formatTime(w.created_at);
    const metaParts = [];
    metaParts.push(`<span class="wish-meta-item"><span class="wish-meta-label">食堂:</span> ${esc(w.canteen)}</span>`);
    if (w.location) {
        metaParts.push(`<span class="wish-meta-item"><span class="wish-meta-label">位置:</span> ${esc(w.location)}</span>`);
    }
    if (w.price) {
        metaParts.push(`<span class="wish-meta-item"><span class="wish-meta-label">价格:</span> ${esc(w.price)}</span>`);
    }

    const linkHTML = w.official_link
        ? `<a class="wish-link" href="${esc(w.official_link)}" target="_blank" rel="noopener noreferrer">查看公众号文章</a>`
        : '';

    const liked = isLiked(w.id);
    const likeCount = Number(w.likes || 0);
    const likeBtnHTML = `
        <button class="wish-like-btn${liked ? ' liked' : ''}" type="button" aria-pressed="${liked ? 'true' : 'false'}" aria-label="点赞">
            <span class="wish-like-icon" aria-hidden="true">${liked ? '♥' : '♡'}</span>
            <span class="wish-like-count">${likeCount}</span>
        </button>`;

    return `
        <div class="wish-info">
            <div class="wish-dish-name">${esc(w.name)}</div>
            <div class="wish-meta">${metaParts.join('')}</div>
            ${linkHTML}
            <div class="wish-submitter">许愿人: ${esc(w.submitter)}</div>
            <div class="wish-time">${time}</div>
        </div>
        <div class="wish-status-cell">
            <span class="status-badge ${STATUS_CSS[getDisplayStatus(w)] || 'status-badge--pending'}">${getDisplayStatus(w)}</span>
            ${likeBtnHTML}
            ${adminPassword ? '<div class="admin-actions"></div>' : ''}
        </div>`;
}

function wireAdminControls(card, w) {
    const actionsEl = card.querySelector('.admin-actions');
    if (!actionsEl) return;

    const statuses = ['待评测', '正在评测', '已评测', '已有重复', '何意味'];
    const btnRow = document.createElement('div');
    btnRow.className = 'admin-status-row';

    statuses.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'btn-status' + (w.status === s ? ' active-status' : '');
        btn.textContent = s;
        btn.addEventListener('click', () => handleStatusChange(w, s, actionsEl));
        btnRow.appendChild(btn);
    });

    const linkInput = document.createElement('input');
    linkInput.className = 'admin-link-input';
    linkInput.placeholder = '公众号链接（已评测/已有重复时必填）';
    linkInput.value = w.official_link || '';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => handleDelete(w.id));

    actionsEl.appendChild(btnRow);
    actionsEl.appendChild(linkInput);
    actionsEl.appendChild(delBtn);
}

/* ---- Like ---- */

function wireLikeButton(container, w) {
    const btn = container.querySelector('.wish-like-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleLikeToggle(w.id, btn);
    });
}

async function handleLikeToggle(wishId, btn) {
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';

    const previouslyLiked = btn.classList.contains('liked');
    const optimisticLiked = !previouslyLiked;
    const countEl = btn.querySelector('.wish-like-count');
    const iconEl = btn.querySelector('.wish-like-icon');
    const prevCount = Number(countEl.textContent || 0);
    const optimisticCount = optimisticLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

    btn.classList.toggle('liked', optimisticLiked);
    btn.setAttribute('aria-pressed', optimisticLiked ? 'true' : 'false');
    if (iconEl) iconEl.textContent = optimisticLiked ? '♥' : '♡';
    countEl.textContent = optimisticCount;
    btn.classList.add('wish-like-bump');
    setTimeout(() => btn.classList.remove('wish-like-bump'), 280);

    try {
        const data = await apiPost(`/api/wishes/${wishId}/like`, {});
        if (!data || data.success === false) {
            throw new Error(data && data.message || '点赞失败');
        }
        const serverLiked = !!data.liked;
        const serverCount = Number(data.likes || 0);
        btn.classList.toggle('liked', serverLiked);
        btn.setAttribute('aria-pressed', serverLiked ? 'true' : 'false');
        if (iconEl) iconEl.textContent = serverLiked ? '♥' : '♡';
        countEl.textContent = serverCount;
        setLikedLocal(wishId, serverLiked);

        const target = wishes.find(x => Number(x.id) === Number(wishId));
        if (target) {
            target.likes = serverCount;
            target.liked = serverLiked;
        }
    } catch (err) {
        btn.classList.toggle('liked', previouslyLiked);
        btn.setAttribute('aria-pressed', previouslyLiked ? 'true' : 'false');
        if (iconEl) iconEl.textContent = previouslyLiked ? '♥' : '♡';
        countEl.textContent = prevCount;
        alert((err && err.message) || '点赞失败，请稍后再试');
    } finally {
        btn.dataset.busy = '';
    }
}

/* ---- Admin Operations ---- */

async function handleStatusChange(w, newStatus, actionsEl) {
    const linkInput = actionsEl.querySelector('.admin-link-input');
    const officialLink = linkInput ? linkInput.value.trim() : '';

    if ((newStatus === '已评测' || newStatus === '已有重复') && !officialLink) {
        alert('转为「已评测」或「已有重复」状态时必须填写公众号链接');
        return;
    }

    const data = await apiPut(`/api/wishes/${w.id}`, {
        password: adminPassword,
        status: newStatus,
        official_link: officialLink,
    });

    if (data.success) {
        await loadWishes();
    } else {
        alert(data.message || '更新失败');
    }
}

async function handleDelete(wishId) {
    if (!confirm('确定要删除这条许愿吗？')) return;

    const data = await apiDelete(`/api/wishes/${wishId}`, {
        password: adminPassword,
    });

    if (data.success) {
        await loadWishes();
    } else {
        alert(data.message || '删除失败');
    }
}

/* ---- Form Submission ---- */

$form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $form.querySelector('.btn-submit');
    btn.disabled = true;
    btn.textContent = '提交中...';
    $formFeedback.className = 'form-feedback';
    $formFeedback.textContent = '';

    const payload = {
        name: document.getElementById('dishName').value.trim(),
        canteen: document.getElementById('canteen').value.trim(),
        location: document.getElementById('location').value.trim(),
        price: document.getElementById('price').value.trim(),
        submitter: document.getElementById('submitter').value.trim(),
    };

    try {
        const data = await apiPost('/api/wishes', payload);
        $formFeedback.className = 'form-feedback ' + (data.success ? 'success' : 'error');
        $formFeedback.textContent = data.message;
        if (data.success) {
            $form.reset();
            $filterInput.value = '';
            switchTab('pool');
            await loadWishes();
        }
    } catch (err) {
        $formFeedback.className = 'form-feedback error';
        $formFeedback.textContent = '无法连接服务器，请稍后再试。';
    } finally {
        btn.disabled = false;
        btn.textContent = '提交许愿';
    }
});

/* ---- Filter ---- */

$filterInput.addEventListener('input', () => {
    loadWishes();
});

$filterStatus.addEventListener('change', () => {
    renderWishes();
});

/* ---- Admin Login/Logout ---- */

$adminToggle.addEventListener('click', () => {
    $adminLogin.classList.toggle('open');
});

$adminLoginBtn.addEventListener('click', async () => {
    const pwd = $adminPasswordInput.value.trim();
    if (!pwd) {
        alert('请输入管理密码');
        return;
    }
    try {
        const res = await fetch(API_BASE + '/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwd }),
        });
        const data = await res.json();
        if (data.success) {
            adminPassword = pwd;
            $adminIndicator.classList.add('visible');
            $adminLogin.classList.remove('open');
            $adminPasswordInput.value = '';
            renderWishes();
        } else {
            alert(data.message || '密码错误');
        }
    } catch {
        alert('无法连接服务器，请稍后再试。');
    }
});

$adminLogoutBtn.addEventListener('click', () => {
    adminPassword = null;
    $adminIndicator.classList.remove('visible');
    renderWishes();
});

/* ---- Utils ---- */

function esc(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
}

function formatTime(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts.replace(' ', 'T') + (ts.includes('+') || ts.includes('Z') ? '' : 'Z'));
        if (isNaN(d.getTime())) return ts;
        return d.toLocaleDateString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
        }) + ' ' + d.toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit', hour12: false,
        });
    } catch {
        return ts;
    }
}

/* ---- Init ---- */

loadWishes();
