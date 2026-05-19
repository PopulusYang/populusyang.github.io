const API_BASE = 'https://api-home.u365043.nyat.app:48307';

const STATUS_LABELS = {
    '待评测': '待评测',
    '正在评测': '正在评测',
    '已评测': '已评测',
    '已有重复': '已有重复',
};

const STATUS_CSS = {
    '待评测': 'status-badge--pending',
    '正在评测': 'status-badge--reviewing',
    '已评测': 'status-badge--done',
    '已有重复': 'status-badge--duplicate',
};

let wishes = [];
let currentTab = 'pool';
let adminPassword = null;

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
    $emptyState.style.display = 'none';

    try {
        const qs = $filterInput.value.trim() ? `?submitter=${encodeURIComponent($filterInput.value.trim())}` : '';
        const data = await apiGet('/api/wishes' + qs);
        if (data.success) {
            wishes = data.wishes;
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
    $loading.style.display = 'none';

    const statusFilter = $filterStatus.value;
    const filtered = statusFilter ? wishes.filter(w => w.status === statusFilter) : wishes;

    document.getElementById('wishCount').textContent = filtered.length;

    if (filtered.length === 0) {
        $emptyState.style.display = 'block';
        return;
    }

    $emptyState.style.display = 'none';

    filtered.forEach(w => {
        const card = document.createElement('div');
        card.className = 'wish-card';
        card.innerHTML = buildWishCardHTML(w);
        $wishGrid.appendChild(card);

        if (adminPassword) {
            wireAdminControls(card, w);
        }
    });
}

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

    return `
        <div class="wish-info">
            <div class="wish-dish-name">${esc(w.name)}</div>
            <div class="wish-meta">${metaParts.join('')}</div>
            ${linkHTML}
            <div class="wish-submitter">许愿人: ${esc(w.submitter)}</div>
            <div class="wish-time">${time}</div>
        </div>
        <div class="wish-status-cell">
            <span class="status-badge ${STATUS_CSS[w.status] || 'status-badge--pending'}">${w.status}</span>
            ${adminPassword ? '<div class="admin-actions"></div>' : ''}
        </div>`;
}

function wireAdminControls(card, w) {
    const actionsEl = card.querySelector('.admin-actions');
    if (!actionsEl) return;

    const statuses = ['待评测', '正在评测', '已评测', '已有重复'];
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
