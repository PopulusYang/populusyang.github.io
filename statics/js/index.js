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

        function ensureRuntimeVersion() {
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

        async function loadFriendsLinks() {
            const hint = document.getElementById('friendsHint');
            const grid = document.getElementById('friendsGrid');
            const empty = document.getElementById('friendsEmpty');

            try {
                const response = await fetch(`links.json?v=${encodeURIComponent(APP_VERSION)}`, {
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

        const APP_VERSION = ensureRuntimeVersion();
        if (APP_VERSION) {
            appendVersionToLinks(APP_VERSION);
        }

        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                window.location.reload();
            }
        });

        if (APP_VERSION) {
            loadFriendsLinks();
        }
