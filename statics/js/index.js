async function loadFriendsLinks() {
    const hint = document.getElementById('friendsHint');
    const grid = document.getElementById('friendsGrid');
    const empty = document.getElementById('friendsEmpty');

    try {
        const response = await fetch(`data/links.json?v=${encodeURIComponent(APP_VERSION)}`, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`无法加载友情链接 (${response.status} ${response.statusText})`);
        }

        const data = await response.json();
        const links = Array.isArray(data) ? data : [];

        grid.innerHTML = '';

        if (!links.length) {
            hint.textContent = '已加载，但当前没有友情链接。';
            empty.classList.remove('hidden');
            return;
        }

        hint.textContent = '';
        empty.classList.add('hidden');

        const fragment = document.createDocumentFragment();
        links.forEach(item => {
            const name = String(item?.name ?? '').trim();
            const link = String(item?.link ?? item?.url ?? '').trim();
            const iconPath = String(item?.icon_path ?? '').trim();

            if (!name || !link) {
                return;
            }

            const card = document.createElement('a');
            card.className = 'friend-card';
            card.href = link;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';

            const content = document.createElement('div');
            content.className = 'friend-card-content';

            if (iconPath) {
                const icon = document.createElement('img');
                icon.className = 'friend-icon';
                icon.src = iconPath;
                icon.alt = `${name} 图标`;
                icon.loading = 'lazy';
                content.appendChild(icon);
            }

            const textWrap = document.createElement('div');
            textWrap.className = 'friend-text';

            const title = document.createElement('p');
            title.className = 'friend-name';
            title.textContent = name;

            const desc = document.createElement('p');
            desc.className = 'friend-desc';
            desc.textContent = '点击访问友情链接';

            textWrap.appendChild(title);
            textWrap.appendChild(desc);
            content.appendChild(textWrap);
            card.appendChild(content);
            fragment.appendChild(card);
        });

        if (!fragment.childNodes.length) {
            hint.textContent = '已加载，但友情链接内容不完整。';
            empty.classList.remove('hidden');
            return;
        }

        grid.appendChild(fragment);
    } catch (err) {
        console.error(err);
        hint.textContent = '友情链接加载失败。';
        empty.classList.remove('hidden');
    }
}

if (APP_VERSION) {
    loadFriendsLinks();
}
