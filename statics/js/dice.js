const dbFile = 'data/menu.db';
let allDishes = [];
let candidateDishes = [];
let availableCanteens = [];
let excludedCanteens = new Set();
let activeSlot = '';
let rolling = false;
const MAX_ROLLS = 5;
let rollCount = 0;
const rollHistory = [];
const EXCLUDED_CANTEENS_STORAGE_KEY = 'hunterHutExcludedCanteens';
let dishesLoaded = false;
let databaseLastUpdated = '';
let scoreFilter = { min: 0, max: 5 };

const blockedEmbedHosts = new Set([
    'mp.weixin.qq.com',
    'weixin.qq.com'
]);

function canEmbedInFrame(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return !blockedEmbedHosts.has(host);
    } catch (err) {
        return false;
    }
}

function normalizeCanteenName(name) {
    return String(name ?? '').trim();
}

function loadExcludedCanteens() {
    try {
        const stored = localStorage.getItem(EXCLUDED_CANTEENS_STORAGE_KEY);
        if (!stored) {
            excludedCanteens = new Set();
            return;
        }

        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            excludedCanteens = new Set();
            return;
        }

        excludedCanteens = new Set(parsed.map(normalizeCanteenName).filter(Boolean));
    } catch (err) {
        excludedCanteens = new Set();
    }
}

function saveExcludedCanteens() {
    try {
        localStorage.setItem(EXCLUDED_CANTEENS_STORAGE_KEY, JSON.stringify([...excludedCanteens]));
    } catch (err) {
        // 忽略无法写入本地存储的情况。
    }
}

function getAvailableCanteens(dishes) {
    return [...new Set(
        dishes
            .map(item => normalizeCanteenName(item.canteen))
            .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function normalizeRatingValue(value) {
    const rating = Number(value);
    return Number.isFinite(rating) ? rating : null;
}

function normalizeScoreBounds(minValue, maxValue) {
    const minRaw = String(minValue ?? '').trim();
    const maxRaw = String(maxValue ?? '').trim();
    const min = minRaw === '' ? null : Number(minRaw);
    const max = maxRaw === '' ? null : Number(maxRaw);

    return {
        min: Number.isFinite(min) ? Math.min(5, Math.max(0, min)) : null,
        max: Number.isFinite(max) ? Math.min(5, Math.max(0, max)) : null
    };
}

function getScoreFilterSummary() {
    const hasMin = scoreFilter.min !== null && scoreFilter.min !== undefined;
    const hasMax = scoreFilter.max !== null && scoreFilter.max !== undefined;

    if (!hasMin && !hasMax) {
        return '评分筛选：未设置，显示全部评分';
    }

    const minText = hasMin ? scoreFilter.min.toFixed(1) : '0.0';
    const maxText = hasMax ? scoreFilter.max.toFixed(1) : '5.0';
    return `评分筛选：${minText} - ${maxText}`;
}

function updateScoreFilterHint() {
    const hint = document.getElementById('scoreFilterHint');
    if (hint) {
        hint.textContent = getScoreFilterSummary();
    }
}

function syncScoreFilterInputs() {
    const minInput = document.getElementById('scoreMinInput');
    const maxInput = document.getElementById('scoreMaxInput');

    if (minInput) {
        minInput.value = scoreFilter.min === null || scoreFilter.min === undefined ? '' : String(scoreFilter.min);
    }

    if (maxInput) {
        maxInput.value = scoreFilter.max === null || scoreFilter.max === undefined ? '' : String(scoreFilter.max);
    }

    updateScoreFilterHint();
}

function applyScoreFilterFromInputs() {
    const minInput = document.getElementById('scoreMinInput');
    const maxInput = document.getElementById('scoreMaxInput');
    const nextFilter = normalizeScoreBounds(minInput ? minInput.value : '', maxInput ? maxInput.value : '');

    if (nextFilter.min !== null && nextFilter.max !== null && nextFilter.min > nextFilter.max) {
        const status = document.getElementById('status');
        status.className = 'status warning';
        status.textContent = '评分筛选无效：最低评分不能高于最高评分。';
        return;
    }

    scoreFilter = nextFilter;
    syncScoreFilterInputs();
    refreshCandidates();
}

function clearScoreFilter() {
    scoreFilter = { min: 0, max: 5 };
    syncScoreFilterInputs();
    refreshCandidates();
}

function dishMatchesScoreFilter(dish) {
    const rating = normalizeRatingValue(dish.ratingValue);
    if (rating === null) {
        return false;
    }

    if (scoreFilter.min !== null && rating < scoreFilter.min) {
        return false;
    }

    if (scoreFilter.max !== null && rating > scoreFilter.max) {
        return false;
    }

    return true;
}

function updateDatabaseMeta() {
    const meta = document.getElementById('dbMeta');
    if (!meta) return;
    meta.textContent = databaseLastUpdated
        ? `数据库最后更新时间：${databaseLastUpdated}`
        : '数据库最后更新时间：暂不可用';
}

function getCurrentSlot(now = new Date()) {
    const minutes = now.getHours() * 60 + now.getMinutes();
    const breakfastEnd = 8 * 60 + 30;
    const dinnerStart = 15 * 60;

    if (minutes < breakfastEnd) return '早餐';
    if (minutes >= dinnerStart) return '晚餐';
    return '午餐';
}

function splitMealTags(mealType) {
    return String(mealType || '')
        .split(/[，,、/;；]/g)
        .map(item => item.trim())
        .filter(Boolean);
}

function dishSupportsSlot(dish, slot) {
    return splitMealTags(dish.mealType).includes(slot);
}

function updateSlotHint() {
    const slotHint = document.getElementById('slotHint');
    activeSlot = getCurrentSlot();
    slotHint.textContent = `当前时段：${activeSlot}`;
}

function isCanteenExcluded(canteen) {
    return excludedCanteens.has(normalizeCanteenName(canteen));
}

function syncExcludedCanteensToAvailable() {
    if (!availableCanteens.length) return;
    const availableSet = new Set(availableCanteens);
    const nextExcluded = new Set([...excludedCanteens].filter(name => availableSet.has(name)));
    if (nextExcluded.size !== excludedCanteens.size) {
        excludedCanteens = nextExcluded;
        saveExcludedCanteens();
    }
}

function renderCanteenFilters() {
    const filterList = document.getElementById('canteenFilterList');
    const filterHint = document.getElementById('canteenFilterHint');
    const clearButton = document.getElementById('clearCanteenFilter');

    if (!filterList || !filterHint || !clearButton) return;

    filterList.innerHTML = '';
    clearButton.disabled = !excludedCanteens.size;

    if (!dishesLoaded) {
        filterHint.textContent = excludedCanteens.size
            ? `已保存 ${excludedCanteens.size} 个排除项，正在加载食堂列表...`
            : '正在加载食堂列表...';
        return;
    }

    if (!availableCanteens.length) {
        filterHint.textContent = allDishes.length
            ? '当前没有可用的食堂筛选项。'
            : '数据库中暂无食堂数据。';
        return;
    }

    filterHint.textContent = excludedCanteens.size
        ? `已排除 ${excludedCanteens.size} 个食堂，点击按钮可恢复。`
        : '点击食堂按钮即可排除该食堂。';

    const fragment = document.createDocumentFragment();
    availableCanteens.forEach(canteen => {
        const chip = document.createElement('button');
        const excluded = excludedCanteens.has(canteen);

        chip.type = 'button';
        chip.className = 'canteen-chip';
        chip.setAttribute('aria-pressed', excluded ? 'true' : 'false');
        chip.setAttribute('title', excluded ? `点击恢复 ${canteen}` : `点击排除 ${canteen}`);
        chip.textContent = canteen;
        chip.addEventListener('click', () => {
            if (excludedCanteens.has(canteen)) {
                excludedCanteens.delete(canteen);
            } else {
                excludedCanteens.add(canteen);
            }
            saveExcludedCanteens();
            renderCanteenFilters();
            refreshCandidates();
        });

        fragment.appendChild(chip);
    });

    filterList.appendChild(fragment);
}

function clearCanteenExclusions() {
    if (!excludedCanteens.size) return;
    excludedCanteens.clear();
    saveExcludedCanteens();
    renderCanteenFilters();
    refreshCandidates();
}

function buildDishFromRow(row, columns) {
    const indexOf = (name) => columns.indexOf(name);
    const read = (name) => {
        const idx = indexOf(name);
        return idx !== -1 ? row[idx] : null;
    };

    const id = read('id');
    const name = String(read('name') ?? '').trim();
    const canteen = String(read('canteen') ?? '未知食堂').trim();
    const ratingRaw = read('rating');
    const ratingNum = Number(ratingRaw);
    const ratingValue = Number.isFinite(ratingNum) ? ratingNum : null;
    const rating = ratingValue === null ? '-' : ratingValue.toFixed(1);
    const mealType = String(read('meal_type') ?? '午餐,晚餐').trim();
    const officialLinkRaw = String(read('official_link') ?? '').trim();
    const officialLink = officialLinkRaw
        ? (officialLinkRaw.startsWith('http://') || officialLinkRaw.startsWith('https://')
            ? officialLinkRaw
            : `http://${officialLinkRaw}`)
        : '';
    const isActiveRaw = read('is_active');
    const isActive = isActiveRaw === null || isActiveRaw === undefined ? true : Number(isActiveRaw) !== 0;

    return { id, name, canteen, rating, ratingValue, mealType, officialLink, isActive };
}

async function loadDishes() {
    if (!APP_VERSION) return;

    const status = document.getElementById('status');
    status.className = 'status';
    status.textContent = '正在加载数据库...';

    const config = {
        locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}`
    };

    try {
        const SQL = await initSqlJs(config);
        const response = await fetch(`${dbFile}?v=${Date.now()}`, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`无法加载数据库文件 (${response.status} ${response.statusText})`);
        }

        const buffer = await response.arrayBuffer();
        const db = new SQL.Database(new Uint8Array(buffer));
        databaseLastUpdated = getDatabaseLastUpdated(db);
        updateDatabaseMeta();

        let result;
        try {
            result = db.exec('SELECT * FROM dishes');
        } catch (err) {
            console.warn('查询全部字段失败，尝试基础字段', err);
            result = db.exec('SELECT id, name, canteen, rating FROM dishes');
        }

        if (!result.length) {
            allDishes = [];
            candidateDishes = [];
            availableCanteens = [];
            dishesLoaded = true;
            renderCanteenFilters();
            updateRollButtonState();
            status.className = 'status warning';
            status.textContent = '数据库为空，暂时没有可抽取的菜品。';
            db.close();
            return;
        }

        const columns = result[0].columns;
        const rows = result[0].values;
        allDishes = rows
            .map(row => buildDishFromRow(row, columns))
            .filter(item => item.name);

        availableCanteens = getAvailableCanteens(allDishes);
        syncExcludedCanteensToAvailable();
        dishesLoaded = true;

        db.close();

        renderCanteenFilters();
        refreshCandidates();
    } catch (err) {
        console.error(err);
        allDishes = [];
        candidateDishes = [];
        availableCanteens = [];
        dishesLoaded = true;
        databaseLastUpdated = '';
        updateDatabaseMeta();
        renderCanteenFilters();
        updateRollButtonState();
        status.className = 'status warning';
        status.textContent = `加载失败：${err.message}`;
    }
}

function refreshCandidates() {
    const status = document.getElementById('status');
    updateSlotHint();

    const activeDishes = allDishes.filter(item => item.isActive);
    candidateDishes = activeDishes.filter(item => dishMatchesScoreFilter(item) && dishSupportsSlot(item, activeSlot) && !isCanteenExcluded(item.canteen));

    if (!candidateDishes.length) {
        status.className = 'status warning';
        status.textContent = `当前时段（${activeSlot}）${excludedCanteens.size ? `在排除 ${excludedCanteens.size} 个食堂后` : ''}${scoreFilter.min !== null || scoreFilter.max !== null ? '在当前评分筛选下' : ''}没有可抽取菜品。`;
        updateRollButtonState();
        return;
    }

    status.className = 'status';
    status.textContent = `已载入 ${candidateDishes.length} 道${activeSlot}菜品${excludedCanteens.size ? `，已排除 ${excludedCanteens.size} 个食堂` : ''}，可开始摇骰子。`;
    updateRollButtonState();
}

function pickRandomDish() {
    if (!candidateDishes.length) return null;
    const randomIndex = Math.floor(Math.random() * candidateDishes.length);
    return candidateDishes[randomIndex];
}

function formatRollTime(dateObj) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
}

function renderRollHistory() {
    const historyCount = document.getElementById('historyCount');
    const historyList = document.getElementById('historyList');
    const historyEmpty = document.getElementById('historyEmpty');

    historyCount.textContent = String(rollCount);
    historyList.innerHTML = '';

    if (!rollHistory.length) {
        historyEmpty.classList.remove('hidden');
        return;
    }

    historyEmpty.classList.add('hidden');
    rollHistory.forEach((record, index) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.textContent = `第${index + 1}次 ${record.time} - ${record.name}（${record.canteen}，评分 ${record.rating}）`;
        historyList.appendChild(li);
    });
}

function appendRollHistory(dish) {
    rollHistory.push({
        name: dish.name,
        canteen: dish.canteen,
        rating: dish.rating,
        time: formatRollTime(new Date())
    });
    renderRollHistory();
}

function updateRollButtonState() {
    const rollLimitHint = document.getElementById('rollLimitHint');
    if (!rollLimitHint) return;

    if (rollCount >= MAX_ROLLS) {
        rollLimitHint.textContent = '别犹豫了就吃这个吧';
        return;
    }

    rollLimitHint.textContent = '';
}

function updateResult(dish) {
    const result = document.getElementById('result');
    const dishName = document.getElementById('dishName');
    const dishMeta = document.getElementById('dishMeta');
    const dishLinkWrap = document.getElementById('dishLinkWrap');
    const dishLink = document.getElementById('dishLink');
    const embedWarning = document.getElementById('embedWarning');
    const detailContainer = document.getElementById('detailContainer');
    const detailFrame = document.getElementById('detailFrame');
    const diceFace = document.getElementById('diceFace');

    if (!dish) {
        result.classList.add('hidden');
        dishLinkWrap.classList.add('hidden');
        embedWarning.classList.add('hidden');
        detailContainer.classList.add('hidden');
        detailFrame.src = 'about:blank';
        diceFace.textContent = '无可用菜品';
        return;
    }

    diceFace.textContent = dish.name;
    dishName.textContent = dish.name;
    dishMeta.textContent = `${dish.canteen} | 评分 ${dish.rating} | 供应时段 ${dish.mealType}`;
    if (dish.officialLink) {
        dishLink.href = dish.officialLink;
        dishLinkWrap.classList.remove('hidden');
        if (canEmbedInFrame(dish.officialLink)) {
            embedWarning.classList.add('hidden');
            detailFrame.src = dish.officialLink;
            detailContainer.classList.remove('hidden');
        } else {
            detailContainer.classList.add('hidden');
            detailFrame.src = 'about:blank';
            embedWarning.textContent = '该链接站点禁止页面内嵌，已为你保留上方详情链接，可点击在新页面打开。';
            embedWarning.classList.remove('hidden');
        }
    } else {
        dishLinkWrap.classList.add('hidden');
        embedWarning.classList.add('hidden');
        detailContainer.classList.add('hidden');
        detailFrame.src = 'about:blank';
    }
    result.classList.remove('hidden');
}

function runRollingAnimation() {
    const dice = document.getElementById('dice');
    const diceFace = document.getElementById('diceFace');

    return new Promise(resolve => {
        dice.classList.add('rolling');

        const timer = setInterval(() => {
            const preview = pickRandomDish();
            if (preview) {
                diceFace.textContent = preview.name;
            }
        }, 110);

        setTimeout(() => {
            clearInterval(timer);
            dice.classList.remove('rolling');
            resolve();
        }, 1650);
    });
}

async function rollDish() {
    if (rolling) return;
    if (rollCount >= MAX_ROLLS) {
        updateRollButtonState();
        return;
    }
    const latestSlot = getCurrentSlot();
    if (latestSlot !== activeSlot) {
        refreshCandidates();
    }

    if (!candidateDishes.length) {
        updateResult(null);
        updateRollButtonState();
        return;
    }

    rolling = true;
    updateRollButtonState();

    await runRollingAnimation();
    const dish = pickRandomDish();
    updateResult(dish);

    if (dish) {
        rollCount += 1;
        appendRollHistory(dish);
    }

    rolling = false;
    updateRollButtonState();
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!APP_VERSION) return;

    loadExcludedCanteens();
    syncScoreFilterInputs();
    updateSlotHint();
    renderCanteenFilters();
    const dice = document.getElementById('dice');
    dice.addEventListener('click', rollDish);
    dice.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            rollDish();
        }
    });
    const clearCanteenFilterButton = document.getElementById('clearCanteenFilter');
    clearCanteenFilterButton.addEventListener('click', clearCanteenExclusions);
    const applyScoreFilterButton = document.getElementById('applyScoreFilter');
    applyScoreFilterButton.addEventListener('click', applyScoreFilterFromInputs);
    const clearScoreFilterButton = document.getElementById('clearScoreFilter');
    clearScoreFilterButton.addEventListener('click', clearScoreFilter);
    const scoreMinInput = document.getElementById('scoreMinInput');
    const scoreMaxInput = document.getElementById('scoreMaxInput');
    scoreMinInput.addEventListener('change', applyScoreFilterFromInputs);
    scoreMaxInput.addEventListener('change', applyScoreFilterFromInputs);
    renderRollHistory();
    updateRollButtonState();

    await loadDishes();

    // 每分钟刷新时段筛选，确保跨时段后抽取规则自动切换。
    setInterval(() => {
        if (!rolling && allDishes.length) {
            refreshCandidates();
        }
    }, 60000);
});
