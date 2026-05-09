/* ===== 小屋暖光粒子效果 ===== */
function createCabinParticles() {
    const container = document.getElementById('cabinParticles');
    if (!container) return;

    const particleCount = Math.min(25, Math.floor(window.innerWidth / 30));
    const colors = ['rgba(212,137,58,', 'rgba(201,119,50,', 'rgba(180,160,100,', 'rgba(220,160,80,'];

    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        const size = 2 + Math.random() * 4;
        const colorIdx = Math.floor(Math.random() * colors.length);
        const opacity = 0.2 + Math.random() * 0.5;
        const duration = 6 + Math.random() * 10;
        const delay = Math.random() * -20;
        const x = Math.random() * 100;
        const y = 10 + Math.random() * 80;
        const drift = (Math.random() - 0.5) * 60;

        p.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 0;
            width: ${size}px; height: ${size}px;
            left: ${x}%;
            top: ${y}%;
            border-radius: 50%;
            background: ${colors[colorIdx]}${opacity});
            box-shadow: 0 0 ${size * 2}px ${colors[colorIdx]}${opacity * 0.5});
            will-change: transform;
            animation: cabin-float ${duration}s ease-in-out ${delay}s infinite;
        `;
        p.style.setProperty('--drift', `${drift}px`);
        container.appendChild(p);
    }
}

const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes cabin-float {
        0%, 100% {
            transform: translateY(0px) translateX(0px) scale(1);
            opacity: 0;
        }
        10% {
            opacity: 1;
        }
        50% {
            transform: translateY(-60px) translateX(var(--drift, 0px)) scale(1.1);
            opacity: 0.8;
        }
        90% {
            opacity: 1;
        }
        100% {
            transform: translateY(-120px) translateX(calc(var(--drift, 0px) * 1.5)) scale(0.8);
            opacity: 0;
        }
    }
`;
document.head.appendChild(styleSheet);

if (APP_VERSION) {
    createCabinParticles();
    window.addEventListener('resize', () => {
        const existing = document.querySelectorAll('#cabinParticles > div');
        if (existing.length !== Math.min(25, Math.floor(window.innerWidth / 30))) {
            document.getElementById('cabinParticles').innerHTML = '';
            createCabinParticles();
        }
    });
}

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
