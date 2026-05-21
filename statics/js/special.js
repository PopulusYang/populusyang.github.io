(function () {
    const dataEmojis = document.body.dataset.emojis;
    if (!dataEmojis) return;
    const emojis = dataEmojis.split(',').map(s => s.trim()).filter(Boolean);
    if (emojis.length === 0) return;

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rain = document.createElement('div');
    rain.className = 'emoji-rain';
    document.body.appendChild(rain);

    const count = Math.max(12, Math.min(28, Math.floor(window.innerWidth / 60)));
    for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        span.style.left = Math.random() * 100 + '%';
        const duration = 4 + Math.random() * 6;
        span.style.animationDuration = duration.toFixed(2) + 's';
        span.style.animationDelay = (-Math.random() * duration).toFixed(2) + 's';
        span.style.fontSize = (1 + Math.random() * 1.4).toFixed(2) + 'rem';
        span.style.opacity = (0.55 + Math.random() * 0.4).toFixed(2);
        rain.appendChild(span);
    }
})();
