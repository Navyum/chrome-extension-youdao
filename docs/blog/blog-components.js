// Blog shared components: navbar, sidebar CTA, related posts, footer, and dot grid background.
(function () {
    'use strict';

    const projectUrl = 'https://github.com/Navyum/chrome-extension-youdaoyun';

    const navbarHTML = `
        <nav class="homepage-nav">
            <div class="nav-content">
                <div class="nav-left">
                    <a href="../index.html">
                        <img src="../images/icon-36x36.png" alt="有道云笔记导出助手 Logo">
                        <span class="logo-text">有道云笔记导出助手</span>
                    </a>
                </div>
                <div class="nav-center">
                    <a href="../index.html#features" class="nav-link">功能特性</a>
                    <a href="../index.html#privacy" class="nav-link">隐私保护</a>
                    <a href="index.html" class="nav-link" style="color: #fff;">博客</a>
                    <a href="../about.html" class="nav-link">关于</a>
                </div>
                <div class="nav-right">
                    <a href="${projectUrl}" target="_blank" rel="noopener" class="nav-cta-button">
                        <span>获取扩展</span>
                    </a>
                </div>
            </div>
        </nav>
    `;

    const sidebarHTML = `
        <div class="cta-card">
            <img src="../images/icon-36x36.png" alt="有道云笔记导出助手" class="cta-icon-img">
            <h3 class="cta-title">立即备份你的笔记</h3>
            <p class="cta-description">使用有道云笔记导出助手，将笔记批量导出为 Markdown，保留目录结构，并把图片和白板资源保存到本地 assets 目录。</p>
            <a href="${projectUrl}" target="_blank" rel="noopener" class="cta-button">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                查看安装方式
            </a>
        </div>

        <div class="related-posts">
            <h4 class="related-posts-title">相关文章推荐</h4>
            <div id="related-posts-list"></div>
        </div>
    `;

    const footerHTML = `
        <footer class="homepage-footer">
            <div class="footer-container">
                <div class="footer-grid">
                    <div class="footer-column">
                        <div class="footer-logo">
                            <img src="../images/icon-36x36.png" alt="有道云笔记导出助手 Logo" class="footer-logo-image">
                            <span class="footer-logo-text">有道云笔记导出助手</span>
                        </div>
                        <p class="footer-description">专业的有道云笔记批量导出解决方案。为隐私而设计，为迁移和备份而生。</p>
                    </div>
                    <div class="footer-column">
                        <h3 class="footer-heading">产品</h3>
                        <ul class="footer-links">
                            <li><a href="../index.html#features">功能特性</a></li>
                            <li><a href="index.html">博客</a></li>
                            <li><a href="../index.html#privacy">隐私保护</a></li>
                            <li><a href="../privacy.html">隐私政策</a></li>
                            <li><a href="../about.html">关于我们</a></li>
                        </ul>
                    </div>
                    <div class="footer-column">
                        <h3 class="footer-heading">支持</h3>
                        <ul class="footer-links">
                            <li><a href="mailto:yhj2433488839@gmail.com">联系我们</a></li>
                            <li><a href="${projectUrl}" target="_blank" rel="noopener">GitHub</a></li>
                        </ul>
                    </div>
                </div>
                <div class="footer-bottom">
                    <p>&copy; 2026 有道云笔记导出助手. Built for better data freedom.</p>
                </div>
            </div>
        </footer>
    `;

    const blogPosts = {
        'blog-third-person.html': {
            title: '2026年有道云笔记数据导出完全指南：3种方案对比与实操',
            shortTitle: '3种导出方案对比',
            related: ['blog-export-markdown-guide.html', 'blog-special-formats.html']
        },
        'blog-export-markdown-guide.html': {
            title: '有道云笔记怎么批量导出 Markdown？零命令行方案',
            shortTitle: '批量导出 Markdown',
            related: ['blog-obsidian.html', 'blog-backup-strategy.html']
        },
        'blog-special-formats.html': {
            title: '表格、思维导图、白板怎么导出？有道特殊格式处理说明',
            shortTitle: '特殊格式转换说明',
            related: ['blog-export-markdown-guide.html', 'blog-technical-deep-dive.html']
        },
        'blog-obsidian.html': {
            title: '把有道云笔记迁移到 Obsidian：目录、图片和检查清单',
            shortTitle: '迁移到 Obsidian',
            related: ['blog-export-markdown-guide.html', 'blog-backup-strategy.html']
        },
        'blog-backup-strategy.html': {
            title: '有道云笔记本地备份策略：什么时候导、导完怎么验',
            shortTitle: '本地备份策略',
            related: ['blog-third-person.html', 'blog-obsidian.html']
        },
        'blog-technical-deep-dive.html': {
            title: '技术复盘：Chrome 扩展如何批量导出有道云笔记',
            shortTitle: '技术架构复盘',
            related: ['blog-special-formats.html', 'blog-third-person.html']
        }
    };

    function insertDotGrid() {
        const wrap = document.createElement('div');
        wrap.className = 'dot-grid';
        wrap.innerHTML = '<div class="dot-grid__wrap"><canvas id="dotCanvas" class="dot-grid__canvas"></canvas></div>';
        document.body.insertBefore(wrap, document.body.firstChild);

        const canvas = document.getElementById('dotCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width, height, dots = [];
        const gap = 32;
        const mouse = { x: -1000, y: -1000 };

        function initDots() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            dots = [];
            for (let x = 0; x < width; x += gap) {
                for (let y = 0; y < height; y += gap) {
                    dots.push({ x, y, originX: x, originY: y, vx: 0, vy: 0, size: 1.5, opacity: 0.15 + Math.random() * 0.1 });
                }
            }
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);
            dots.forEach(dot => {
                const dx = mouse.x - dot.x;
                const dy = mouse.y - dot.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 220) {
                    const angle = Math.atan2(dy, dx);
                    const force = (220 - dist) / 220;
                    dot.vx -= Math.cos(angle) * force * 1.8;
                    dot.vy -= Math.sin(angle) * force * 1.8;
                    dot.opacity = Math.min(0.9, dot.opacity + 0.1);
                }
                dot.vx += (dot.originX - dot.x) * 0.12;
                dot.vy += (dot.originY - dot.y) * 0.12;
                dot.vx *= 0.88;
                dot.vy *= 0.88;
                dot.x += dot.vx;
                dot.y += dot.vy;
                dot.opacity += (0.15 - dot.opacity) * 0.05;
                ctx.fillStyle = `rgba(255, 255, 255, ${dot.opacity})`;
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
                ctx.fill();
            });
            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', initDots);
        window.addEventListener('mousemove', e => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });
        initDots();
        animate();
    }

    function insertNavbar() {
        const temp = document.createElement('div');
        temp.innerHTML = navbarHTML;
        document.body.insertBefore(temp.firstElementChild, document.body.firstChild);
    }

    function insertSidebar() {
        const sidebar = document.querySelector('.blog-sidebar-right');
        if (sidebar) {
            sidebar.innerHTML = sidebarHTML;
            generateRelatedPosts();
        }
    }

    function generateRelatedPosts() {
        const list = document.getElementById('related-posts-list');
        if (!list) return;
        const currentPage = window.location.pathname.split('/').pop();
        const config = blogPosts[currentPage];
        if (!config || !config.related) return;
        list.innerHTML = config.related.map(filename => {
            const post = blogPosts[filename];
            const title = post ? post.shortTitle : filename;
            return `<div class="related-post-item"><a href="${filename}" class="related-post-link">${title}</a></div>`;
        }).join('');
    }

    function insertFooter() {
        const layout = document.querySelector('.blog-layout') || document.querySelector('.blog-grid-section');
        if (layout) {
            const temp = document.createElement('div');
            temp.innerHTML = footerHTML;
            layout.parentNode.insertBefore(temp.firstElementChild, layout.nextSibling);
        }
    }

    function initComponents() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initComponents);
            return;
        }
        insertDotGrid();
        insertNavbar();
        insertSidebar();
        insertFooter();
        window.dispatchEvent(new Event('blogComponentsReady'));
    }

    initComponents();
    window.BlogComponents = { posts: blogPosts };
})();
