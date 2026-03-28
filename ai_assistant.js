(function () {
    const STYLE_ID = 'lcq-ai-assistant-style';
    const PAGE_LABELS = {
        index_home: '首页',
        cpp_thread: 'C++ 学习',
        interview_guide: '面试八股',
        weekly_plans: 'Weekly Plans'
    };

    const DEFAULT_THEMES = {
        dark: {
            surface: 'dark',
            accent: '#06b6d4',
            accentStrong: '#0891b2',
            accentSoft: 'rgba(6, 182, 212, 0.16)',
            accentText: '#67e8f9'
        },
        light: {
            surface: 'light',
            accent: '#0f766e',
            accentStrong: '#115e59',
            accentSoft: 'rgba(20, 184, 166, 0.14)',
            accentText: '#0f766e'
        }
    };

    const state = {
        initialized: false,
        config: null,
        refs: null,
        history: [],
        serviceStatus: null,
        sending: false,
        settingsOpen: false,
        settingsLoading: false,
        deletingHistoryId: null
    };

    const injectStyles = () => {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .lcq-ai-shell {
                --lcq-ai-accent: #0f766e;
                --lcq-ai-accent-strong: #115e59;
                --lcq-ai-accent-soft: rgba(20, 184, 166, 0.14);
                --lcq-ai-accent-text: #0f766e;
                --lcq-ai-panel-bg: rgba(255, 255, 255, 0.96);
                --lcq-ai-panel-border: rgba(231, 229, 228, 0.95);
                --lcq-ai-panel-text: #1f2937;
                --lcq-ai-panel-muted: #6b7280;
                --lcq-ai-panel-subtle: #f5f5f4;
                --lcq-ai-card-bg: rgba(250, 250, 249, 0.96);
                --lcq-ai-overlay: rgba(15, 23, 42, 0.28);
                position: fixed;
                inset: 0;
                z-index: 10020;
                pointer-events: none;
                font-family: inherit;
            }

            .lcq-ai-shell[data-surface="dark"] {
                --lcq-ai-panel-bg: rgba(15, 23, 42, 0.96);
                --lcq-ai-panel-border: rgba(51, 65, 85, 0.95);
                --lcq-ai-panel-text: #e2e8f0;
                --lcq-ai-panel-muted: #94a3b8;
                --lcq-ai-panel-subtle: rgba(15, 23, 42, 0.72);
                --lcq-ai-card-bg: rgba(30, 41, 59, 0.82);
                --lcq-ai-overlay: rgba(2, 6, 23, 0.52);
            }

            .lcq-ai-shell.open {
                pointer-events: auto;
            }

            .lcq-ai-fab {
                position: fixed;
                right: 20px;
                bottom: 20px;
                width: 58px;
                height: 58px;
                border: 0;
                border-radius: 999px;
                background: linear-gradient(135deg, var(--lcq-ai-accent), var(--lcq-ai-accent-strong));
                color: white;
                cursor: pointer;
                box-shadow: 0 18px 35px -18px rgba(15, 23, 42, 0.45);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 15px;
                font-weight: 700;
                letter-spacing: 0.02em;
                pointer-events: auto;
                transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            }

            .lcq-ai-fab:hover {
                transform: translateY(-2px);
                box-shadow: 0 22px 40px -18px rgba(15, 23, 42, 0.55);
            }

            .lcq-ai-fab:disabled {
                opacity: 0.72;
                cursor: not-allowed;
            }

            .lcq-ai-overlay {
                position: absolute;
                inset: 0;
                background: var(--lcq-ai-overlay);
                opacity: 0;
                transition: opacity 0.22s ease;
                pointer-events: none;
            }

            .lcq-ai-shell.open .lcq-ai-overlay {
                opacity: 1;
                pointer-events: auto;
            }

            .lcq-ai-panel {
                position: absolute;
                top: 0;
                right: 0;
                width: min(420px, 100vw);
                height: 100%;
                background: var(--lcq-ai-panel-bg);
                color: var(--lcq-ai-panel-text);
                border-left: 1px solid var(--lcq-ai-panel-border);
                backdrop-filter: blur(16px);
                transform: translateX(100%);
                transition: transform 0.24s ease;
                display: flex;
                flex-direction: column;
                box-shadow: -24px 0 40px -24px rgba(15, 23, 42, 0.25);
            }

            .lcq-ai-shell.open .lcq-ai-panel {
                transform: translateX(0);
            }

            .lcq-ai-header {
                padding: 18px;
                border-bottom: 1px solid var(--lcq-ai-panel-border);
                display: flex;
                gap: 12px;
                align-items: center;
                justify-content: space-between;
            }

            .lcq-ai-title-wrap {
                min-width: 0;
            }

            .lcq-ai-header-actions {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-shrink: 0;
            }

            .lcq-ai-header-btn {
                border: 1px solid var(--lcq-ai-panel-border);
                background: var(--lcq-ai-card-bg);
                color: var(--lcq-ai-panel-muted);
                border-radius: 999px;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
            }

            .lcq-ai-header-btn:hover {
                color: var(--lcq-ai-accent-text);
                border-color: var(--lcq-ai-accent);
                background: var(--lcq-ai-accent-soft);
            }

            .lcq-ai-kicker {
                font-size: 11px;
                letter-spacing: 0.18em;
                text-transform: uppercase;
                color: var(--lcq-ai-panel-muted);
                margin-bottom: 6px;
            }

            .lcq-ai-title {
                font-size: 18px;
                font-weight: 800;
                line-height: 1.2;
                margin: 0;
            }

            .lcq-ai-desc {
                margin: 8px 0 0;
                color: var(--lcq-ai-panel-muted);
                font-size: 13px;
                line-height: 1.55;
            }

            .lcq-ai-close {
                width: 36px;
                height: 36px;
                border-radius: 999px;
                border: 1px solid var(--lcq-ai-panel-border);
                background: transparent;
                color: var(--lcq-ai-panel-muted);
                cursor: pointer;
                flex-shrink: 0;
                transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
            }

            .lcq-ai-close:hover {
                color: var(--lcq-ai-panel-text);
                border-color: var(--lcq-ai-accent);
                background: var(--lcq-ai-accent-soft);
            }

            .lcq-ai-meta {
                padding: 14px 18px 0;
                display: grid;
                gap: 12px;
            }

            .lcq-ai-chip-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .lcq-ai-chip {
                padding: 6px 10px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 700;
                background: var(--lcq-ai-card-bg);
                border: 1px solid var(--lcq-ai-panel-border);
                color: var(--lcq-ai-panel-muted);
            }

            .lcq-ai-chip.accent {
                color: var(--lcq-ai-accent-text);
                background: var(--lcq-ai-accent-soft);
                border-color: transparent;
            }

            .lcq-ai-context-card,
            .lcq-ai-status-card {
                background: var(--lcq-ai-card-bg);
                border: 1px solid var(--lcq-ai-panel-border);
                border-radius: 16px;
                padding: 14px;
            }

            .lcq-ai-section-label {
                font-size: 11px;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                color: var(--lcq-ai-panel-muted);
                margin-bottom: 8px;
            }

            .lcq-ai-context-title {
                font-size: 14px;
                font-weight: 700;
                margin-bottom: 6px;
                line-height: 1.45;
            }

            .lcq-ai-context-body,
            .lcq-ai-status-body {
                font-size: 13px;
                line-height: 1.62;
                color: var(--lcq-ai-panel-muted);
                white-space: pre-wrap;
            }

            .lcq-ai-quick-actions {
                padding: 12px 18px 0;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .lcq-ai-action-btn {
                border: 1px solid var(--lcq-ai-panel-border);
                background: var(--lcq-ai-card-bg);
                color: var(--lcq-ai-panel-text);
                border-radius: 999px;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
            }

            .lcq-ai-action-btn:hover {
                border-color: var(--lcq-ai-accent);
                color: var(--lcq-ai-accent-text);
                background: var(--lcq-ai-accent-soft);
                transform: translateY(-1px);
            }

            .lcq-ai-history-wrap {
                flex: 1;
                min-height: 0;
                padding: 18px 18px 0;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .lcq-ai-history-list {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 14px;
                padding-bottom: 12px;
            }

            .lcq-ai-hidden {
                display: none !important;
            }

            .lcq-ai-settings-pane {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                display: grid;
                gap: 14px;
                padding-bottom: 12px;
            }

            .lcq-ai-settings-card {
                border: 1px solid var(--lcq-ai-panel-border);
                background: var(--lcq-ai-card-bg);
                border-radius: 20px;
                padding: 16px;
                display: grid;
                gap: 12px;
            }

            .lcq-ai-settings-head {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 12px;
            }

            .lcq-ai-settings-kicker {
                font-size: 11px;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: var(--lcq-ai-panel-muted);
            }

            .lcq-ai-settings-title {
                margin: 6px 0 0;
                font-size: 16px;
                font-weight: 800;
                line-height: 1.4;
            }

            .lcq-ai-settings-pill {
                padding: 6px 10px;
                border-radius: 999px;
                border: 1px solid var(--lcq-ai-panel-border);
                font-size: 12px;
                font-weight: 700;
                color: var(--lcq-ai-panel-muted);
                white-space: nowrap;
            }

            .lcq-ai-settings-pill.ready {
                color: var(--lcq-ai-accent-text);
                background: var(--lcq-ai-accent-soft);
                border-color: transparent;
            }

            .lcq-ai-settings-pill.warn {
                color: #f59e0b;
                background: rgba(245, 158, 11, 0.12);
                border-color: rgba(245, 158, 11, 0.18);
            }

            .lcq-ai-settings-text,
            .lcq-ai-settings-meta,
            .lcq-ai-settings-note {
                font-size: 13px;
                line-height: 1.65;
                color: var(--lcq-ai-panel-muted);
                white-space: pre-wrap;
            }

            .lcq-ai-settings-meta {
                display: grid;
                gap: 4px;
            }

            .lcq-ai-settings-pre {
                margin: 0;
                padding: 14px;
                border-radius: 16px;
                border: 1px solid var(--lcq-ai-panel-border);
                background: rgba(2, 6, 23, 0.78);
                color: #cbd5f5;
                font-size: 12px;
                line-height: 1.7;
                overflow-x: auto;
                white-space: pre;
            }

            .lcq-ai-empty {
                border: 1px dashed var(--lcq-ai-panel-border);
                border-radius: 18px;
                padding: 16px;
                font-size: 13px;
                color: var(--lcq-ai-panel-muted);
                line-height: 1.62;
                background: var(--lcq-ai-card-bg);
            }

            .lcq-ai-entry {
                border-radius: 18px;
                padding: 2px 0 0;
                display: grid;
                gap: 8px;
            }

            .lcq-ai-entry.pending {
                opacity: 0.92;
            }

            .lcq-ai-entry-tools {
                display: flex;
                justify-content: flex-end;
                margin-bottom: -2px;
            }

            .lcq-ai-entry-delete {
                border: 0;
                background: transparent;
                color: var(--lcq-ai-panel-muted);
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                padding: 0;
                transition: color 0.2s ease;
            }

            .lcq-ai-entry-delete:hover {
                color: #ef4444;
            }

            .lcq-ai-entry-delete:disabled {
                opacity: 0.56;
                cursor: not-allowed;
            }

            .lcq-ai-entry-time {
                font-size: 11px;
                color: var(--lcq-ai-panel-muted);
                text-align: right;
            }

            .lcq-ai-entry-block {
                display: grid;
                gap: 0;
            }

            .lcq-ai-entry-content {
                font-size: 13px;
                line-height: 1.65;
                white-space: pre-wrap;
                word-break: break-word;
                border-radius: 18px;
                padding: 12px 14px;
            }

            .lcq-ai-entry-content.user {
                background: var(--lcq-ai-accent-soft);
                color: var(--lcq-ai-panel-text);
            }

            .lcq-ai-entry-content.assistant {
                background: var(--lcq-ai-card-bg);
                border: 1px solid var(--lcq-ai-panel-border);
            }

            .lcq-ai-footer {
                border-top: 1px solid var(--lcq-ai-panel-border);
                padding: 14px 18px 18px;
                display: grid;
                gap: 12px;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0), var(--lcq-ai-panel-bg) 24%);
            }

            .lcq-ai-input {
                width: 100%;
                min-height: 92px;
                resize: vertical;
                border-radius: 16px;
                border: 1px solid var(--lcq-ai-panel-border);
                background: var(--lcq-ai-card-bg);
                color: var(--lcq-ai-panel-text);
                padding: 12px 14px;
                font-size: 14px;
                line-height: 1.6;
                outline: none;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }

            .lcq-ai-input:focus {
                border-color: var(--lcq-ai-accent);
                box-shadow: 0 0 0 3px var(--lcq-ai-accent-soft);
            }

            .lcq-ai-footer-row {
                display: flex;
                justify-content: flex-end;
            }

            .lcq-ai-send-btn {
                border: 0;
                background: linear-gradient(135deg, var(--lcq-ai-accent), var(--lcq-ai-accent-strong));
                color: white;
                font-size: 13px;
                font-weight: 800;
                border-radius: 999px;
                padding: 11px 16px;
                cursor: pointer;
                min-width: 96px;
                transition: opacity 0.2s ease, transform 0.2s ease;
            }

            .lcq-ai-send-btn:hover {
                transform: translateY(-1px);
            }

            .lcq-ai-send-btn:disabled,
            .lcq-ai-action-btn:disabled {
                opacity: 0.64;
                cursor: not-allowed;
                transform: none;
            }

            @media (max-width: 640px) {
                .lcq-ai-fab {
                    right: 16px;
                    bottom: 16px;
                    width: 54px;
                    height: 54px;
                    font-size: 14px;
                }

                .lcq-ai-panel {
                    width: 100vw;
                }

                .lcq-ai-title {
                    font-size: 18px;
                }
            }
        `;
        document.head.appendChild(style);
    };

    const compactText = (value) => String(value || '')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    const truncate = (value, max) => {
        const text = compactText(value);
        if (!max || text.length <= max) return text;
        return `${text.slice(0, Math.max(0, max - 1))}…`;
    };

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const stripMarkdownForDisplay = (value) => compactText(String(value || '')
        .replace(/```(?:[\w+-]+)?\s*([\s\S]*?)```/g, '\n$1\n')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/(^|\n)#{1,6}\s+/g, '$1')
        .replace(/(^|\n)>\s?/g, '$1')
        .replace(/^\s*[*+]\s+/gm, '- ')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
        .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1$2')
        .replace(/\n{3,}/g, '\n\n'));

    const formatTime = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTheme = (theme) => {
        if (!theme) return DEFAULT_THEMES.light;
        const preset = theme.surface === 'dark' ? DEFAULT_THEMES.dark : DEFAULT_THEMES.light;
        return {
            surface: theme.surface === 'dark' ? 'dark' : 'light',
            accent: theme.accent || preset.accent,
            accentStrong: theme.accentStrong || preset.accentStrong,
            accentSoft: theme.accentSoft || preset.accentSoft,
            accentText: theme.accentText || preset.accentText
        };
    };

    const getPageLabel = (pageType) => PAGE_LABELS[pageType] || '学习页面';

    const getActorRole = () => {
        try {
            return window.LCQAdminAuth?.getState?.()?.role || 'guest';
        } catch (error) {
            return 'guest';
        }
    };

    const defaultQuickActions = (pageType) => {
        if (pageType === 'cpp_thread') {
            return [
                { label: '解释当前章节', prompt: '请结合当前章节内容，先用白话解释一遍，再补一个最小可运行例子。' },
                { label: '生成例子', prompt: '请基于当前章节内容，给我一个更贴近工程场景的 C++ 例子，并解释关键点。' },
                { label: '出 3 道练习题', prompt: '请基于当前章节内容给我出 3 道练习题，并附上简短参考方向。' },
                { label: '总结当前章节', prompt: '请帮我总结当前章节，按核心概念、易错点、面试高频点来整理。' }
            ];
        }

        if (pageType === 'interview_guide') {
            return [
                { label: '帮我回答这题', prompt: '请基于当前题目给出一版结构清晰、适合面试现场直接说的回答。' },
                { label: '口语版回答', prompt: '请把当前题目的答案改写成更自然的面试口语表达。' },
                { label: '模拟面试官追问', prompt: '请基于当前题目继续追问我。', actionMode: 'interview_followup' },
                { label: '压缩成 30 秒', prompt: '请把当前题目压缩成 30 秒内能说完的版本。' }
            ];
        }

        if (pageType === 'weekly_plans') {
            return [
                { label: '拆解本周计划', prompt: '请把当前周学习内容拆成周一到周日的每日计划。', actionMode: 'weekly_plan' },
                { label: '总结本周进度', prompt: '请只基于当前周 Weekly Plans 内容，总结本周学习进度。', actionMode: 'weekly_summary' },
                { label: '找风险点', prompt: '请基于当前周计划帮我找出可能拖慢进度的风险点，并给出调整建议。' },
                { label: '整理下周重点', prompt: '请根据当前周内容，帮我整理下周最值得延续的重点。' }
            ];
        }

        return [
            { label: '网站里有什么', prompt: '请基于网站公开内容，告诉我这个网站目前主要有哪些学习模块和资料。' },
            { label: '总结本周学习', prompt: '请基于公开 Weekly Plans 数据，帮我总结最近一周的学习重点。' },
            { label: 'C++ 最近在学什么', prompt: '请基于公开内容，帮我总结 C++ 模块最近覆盖了哪些重点。' },
            { label: '八股从哪开始', prompt: '请基于公开题库，给我一个八股模块的入门顺序建议。' }
        ];
    };

    const resolvePageKey = (config) => {
        if (typeof config.getPageKey === 'function') {
            return truncate(config.getPageKey(), 120);
        }
        return truncate(config.pageKey || config.pageType || 'page', 120);
    };

    const buildContext = (config, actionMode) => {
        const fallbackTitle = getPageLabel(config.pageType);

        if (typeof config.getContext === 'function') {
            const context = config.getContext({ actionMode }) || {};
            return {
                scope: truncate(context.scope || 'current_page', 80),
                title: truncate(context.title || fallbackTitle, 200),
                content: truncate(context.content || '', 4200)
            };
        }

        return {
            scope: 'current_page',
            title: fallbackTitle,
            content: ''
        };
    };

    const getFunctionUrl = (config) => {
        const base = String(config.supabaseUrl || '').replace(/\/+$/, '');
        return `${base}/functions/v1/${config.functionName || 'ai-assistant'}`;
    };

    const requestService = async (config, payload) => {
        const response = await fetch(getFunctionUrl(config), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': config.supabaseAnonKey,
                'Authorization': `Bearer ${config.supabaseAnonKey}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `AI 服务请求失败（HTTP ${response.status}）`);
        }
        return data;
    };

    const canShowSettingsEntry = () => {
        const config = state.config || {};

        if (typeof config.canShowSettingsEntry === 'function') {
            return !!config.canShowSettingsEntry();
        }

        if (typeof config.showSettingsEntry === 'boolean') {
            return config.showSettingsEntry;
        }

        try {
            return !!window.LCQAdminAuth?.isAuthenticated?.();
        } catch (error) {
            return false;
        }
    };

    const canManageHistory = () => {
        const config = state.config || {};

        if (typeof config.canManageHistory === 'function') {
            return !!config.canManageHistory();
        }

        if (typeof config.manageHistory === 'boolean') {
            return config.manageHistory;
        }

        try {
            return !!window.LCQAdminAuth?.isAuthenticated?.();
        } catch (error) {
            return false;
        }
    };

    const supportsHistoryDeletion = () => !!state.serviceStatus?.capabilities?.deleteHistory;

    const createShell = (config) => {
        injectStyles();

        const shell = document.createElement('div');
        shell.className = 'lcq-ai-shell';

        const theme = getTheme(config.theme);
        shell.dataset.surface = theme.surface;
        shell.style.setProperty('--lcq-ai-accent', theme.accent);
        shell.style.setProperty('--lcq-ai-accent-strong', theme.accentStrong);
        shell.style.setProperty('--lcq-ai-accent-soft', theme.accentSoft);
        shell.style.setProperty('--lcq-ai-accent-text', theme.accentText);

        shell.innerHTML = `
            <button type="button" class="lcq-ai-fab" aria-label="打开 AI 助手">AI</button>
            <div class="lcq-ai-overlay"></div>
            <aside class="lcq-ai-panel" aria-label="统一 AI 学习助手">
                <div class="lcq-ai-header">
                    <div class="lcq-ai-title-wrap">
                        <h2 class="lcq-ai-title" data-role="title">统一 AI 学习助手</h2>
                    </div>
                    <div class="lcq-ai-header-actions">
                        <button type="button" class="lcq-ai-header-btn lcq-ai-hidden" data-role="settings-btn">配置</button>
                        <button type="button" class="lcq-ai-close" aria-label="关闭 AI 助手">✕</button>
                    </div>
                </div>

                <div class="lcq-ai-history-wrap">
                    <div class="lcq-ai-settings-pane lcq-ai-hidden" data-role="settings-pane">
                        <section class="lcq-ai-settings-card">
                            <div class="lcq-ai-settings-head">
                                <div>
                                    <div class="lcq-ai-settings-kicker">Server Config</div>
                                    <h3 class="lcq-ai-settings-title">统一 AI 服务配置</h3>
                                </div>
                                <span class="lcq-ai-settings-pill" data-role="settings-status-pill">未检查</span>
                            </div>
                            <div class="lcq-ai-settings-text" data-role="settings-status-text">正在检查统一 AI 服务状态...</div>
                            <div class="lcq-ai-settings-meta" data-role="settings-meta">
                                <div>Provider：DeepSeek</div>
                                <div>Storage：Supabase Edge Function 环境变量</div>
                            </div>
                        </section>

                        <section class="lcq-ai-settings-card">
                            <div>
                                <div class="lcq-ai-settings-kicker">Deploy Guide</div>
                                <h3 class="lcq-ai-settings-title">安全部署方式</h3>
                            </div>
                            <div class="lcq-ai-settings-note">为了避免把 DeepSeek Key 暴露到前端源码、localStorage 或普通可读表里，这里只展示服务端配置状态和部署说明。真正的 Key 需要放到 Supabase Edge Function 环境变量。</div>
                            <pre class="lcq-ai-settings-pre">supabase functions secrets set \
DEEPSEEK_API_KEY=&lt;你的_key&gt; \
DEEPSEEK_API_ENDPOINT=https://api.deepseek.com/chat/completions \
DEEPSEEK_MODEL=deepseek-chat \
SUPABASE_SERVICE_ROLE_KEY=&lt;service_role_key&gt;

supabase functions deploy ai-assistant</pre>
                            <div class="lcq-ai-settings-note">仓库内已补好 <code>supabase/functions/ai-assistant/index.ts</code>、<code>supabase/config.toml</code> 和 <code>supabase/migrations/20260328110000_ai_assistant.sql</code>。</div>
                        </section>
                    </div>
                    <div class="lcq-ai-history-list" data-role="history-list"></div>
                </div>

                <div class="lcq-ai-footer" data-role="footer">
                    <textarea class="lcq-ai-input" data-role="input" placeholder="输入你的问题"></textarea>
                    <div class="lcq-ai-footer-row">
                        <button type="button" class="lcq-ai-send-btn" data-role="send-btn">发送</button>
                    </div>
                </div>
            </aside>
        `;

        document.body.appendChild(shell);

        return {
            shell,
            fab: shell.querySelector('.lcq-ai-fab'),
            overlay: shell.querySelector('.lcq-ai-overlay'),
            title: shell.querySelector('[data-role="title"]'),
            settingsBtn: shell.querySelector('[data-role="settings-btn"]'),
            close: shell.querySelector('.lcq-ai-close'),
            settingsPane: shell.querySelector('[data-role="settings-pane"]'),
            settingsStatusPill: shell.querySelector('[data-role="settings-status-pill"]'),
            settingsStatusText: shell.querySelector('[data-role="settings-status-text"]'),
            settingsMeta: shell.querySelector('[data-role="settings-meta"]'),
            historyList: shell.querySelector('[data-role="history-list"]'),
            footer: shell.querySelector('[data-role="footer"]'),
            input: shell.querySelector('[data-role="input"]'),
            sendBtn: shell.querySelector('[data-role="send-btn"]')
        };
    };

    const renderHistory = () => {
        const { refs } = state;
        if (!refs) return;

        refs.historyList.innerHTML = '';

        if (!state.history.length) {
            refs.historyList.innerHTML = `
                <div class="lcq-ai-empty">
                    这里会展示全站统一保留的最近 10 轮问答。当前还没有历史记录，你可以直接开始提问。
                </div>
            `;
            return;
        }

        state.history.forEach((entry) => {
            const wrapper = document.createElement('article');
            wrapper.className = `lcq-ai-entry ${entry.pending ? 'pending' : ''}`;

            const timeLabel = entry.pending
                ? '正在回复...'
                : (entry.created_at ? formatTime(entry.created_at) : '');
            const canDelete = canManageHistory() && supportsHistoryDeletion() && !!entry.id && !entry.pending;
            const deleting = state.deletingHistoryId === entry.id;

            wrapper.innerHTML = `
                ${canDelete ? `
                    <div class="lcq-ai-entry-tools">
                        <button
                            type="button"
                            class="lcq-ai-entry-delete"
                            data-action="delete-history"
                            data-history-id="${escapeHtml(entry.id)}"
                            ${deleting ? 'disabled' : ''}
                        >${deleting ? '删除中...' : '删除'}</button>
                    </div>
                ` : ''}
                <div class="lcq-ai-entry-block">
                    <div class="lcq-ai-entry-content user">${escapeHtml(entry.user_question || '')}</div>
                </div>
                <div class="lcq-ai-entry-block">
                    <div class="lcq-ai-entry-content assistant">${escapeHtml(stripMarkdownForDisplay(entry.ai_answer || ''))}</div>
                </div>
                ${timeLabel ? `<div class="lcq-ai-entry-time">${escapeHtml(timeLabel)}</div>` : ''}
            `;

            refs.historyList.appendChild(wrapper);
        });
    };

    const renderContextPreview = (actionMode) => {
        if (!state.config) return;
        buildContext(state.config, actionMode || 'general');
    };

    const renderShellMode = () => {
        const { refs } = state;
        if (!refs) return;

        const settingsVisible = canShowSettingsEntry();
        if (!settingsVisible) {
            state.settingsOpen = false;
        }

        refs.settingsBtn.classList.toggle('lcq-ai-hidden', !settingsVisible);
        refs.settingsBtn.textContent = state.settingsOpen ? '返回' : '配置';
        refs.title.textContent = state.settingsOpen ? 'AI 服务配置' : '统一 AI 学习助手';
        refs.settingsPane.classList.toggle('lcq-ai-hidden', !state.settingsOpen);
        refs.historyList.classList.toggle('lcq-ai-hidden', state.settingsOpen);
        refs.footer.classList.toggle('lcq-ai-hidden', state.settingsOpen);
    };

    const renderSettingsStatus = () => {
        const { refs, serviceStatus } = state;
        if (!refs) return;

        if (state.settingsLoading) {
            refs.settingsStatusPill.textContent = '检查中';
            refs.settingsStatusPill.className = 'lcq-ai-settings-pill';
            refs.settingsStatusText.textContent = '正在检查 Supabase Edge Function 与统一模型配置状态...';
            refs.settingsMeta.innerHTML = '<div>Provider：DeepSeek</div><div>Storage：Supabase Edge Function 环境变量</div>';
            return;
        }

        if (!serviceStatus) {
            refs.settingsStatusPill.textContent = '未检查';
            refs.settingsStatusPill.className = 'lcq-ai-settings-pill';
            refs.settingsStatusText.textContent = '这里会显示统一 AI 服务端代理的当前状态。';
            refs.settingsMeta.innerHTML = '<div>Provider：DeepSeek</div><div>Storage：Supabase Edge Function 环境变量</div>';
            return;
        }

        const configured = !!serviceStatus.configured;
        refs.settingsStatusPill.textContent = configured ? '已配置' : '未配置';
        refs.settingsStatusPill.className = configured
            ? 'lcq-ai-settings-pill ready'
            : 'lcq-ai-settings-pill warn';
        refs.settingsStatusText.textContent = configured
            ? '统一 AI 服务端代理已可用。现在全站右下角统一 AI 按钮会共用这一套云端配置，普通用户不需要再输入任何 API Key。'
            : (serviceStatus.error || '当前 Edge Function 还没有完成服务端密钥配置。为了安全，前端不会提供本地 key 录入回退方案。');
        refs.settingsMeta.innerHTML = `
            <div>Provider：${escapeHtml(serviceStatus.provider || 'DeepSeek')}</div>
            <div>Model：${escapeHtml(serviceStatus.model || 'deepseek-chat')}</div>
            <div>Endpoint：${escapeHtml(serviceStatus.endpointDisplay || 'https://api.deepseek.com/chat/completions')}</div>
            <div>Storage：${escapeHtml(serviceStatus.storage || 'Supabase Edge Function 环境变量')}</div>
        `;
    };

    const fetchServiceStatusInternal = async ({ panelLoading = false } = {}) => {
        if (!state.config) return null;

        if (panelLoading) {
            state.settingsLoading = true;
            renderSettingsStatus();
        }

        try {
            const data = await requestService(state.config, { action: 'config-status' });
            state.serviceStatus = data;
            renderServiceStatus();
            return data;
        } catch (error) {
            state.serviceStatus = {
                configured: false,
                error: error.message || '服务检测失败。'
            };
            renderServiceStatus();
            throw error;
        } finally {
            if (panelLoading) {
                state.settingsLoading = false;
                renderSettingsStatus();
            }
        }
    };

    const renderServiceStatus = () => {
        const { serviceStatus, config } = state;

        renderSettingsStatus();

        if (!serviceStatus) return;

        if (typeof config.onServiceStatusChange === 'function') {
            config.onServiceStatusChange(serviceStatus);
        }

        window.dispatchEvent(new CustomEvent('lcq-ai-assistant-status', {
            detail: serviceStatus
        }));
    };

    const updateSendState = () => {
        const { refs } = state;
        if (!refs) return;

        refs.sendBtn.disabled = state.sending;
        refs.fab.disabled = false;
        refs.sendBtn.textContent = state.sending ? '发送中...' : '发送';
    };

    const loadHistory = async () => {
        const { config } = state;
        if (!config) return;

        try {
            const data = await requestService(config, { action: 'history' });
            state.serviceStatus = data;
            state.history = Array.isArray(data.history) ? data.history : [];
            renderServiceStatus();
            renderHistory();
            return data;
        } catch (error) {
            state.serviceStatus = {
                configured: false,
                error: error.message || '读取历史失败。'
            };
            state.history = [];
            renderServiceStatus();
            renderHistory();
            throw error;
        }
    };

    const dispatchResponseEvent = (detail) => {
        window.dispatchEvent(new CustomEvent('lcq-ai-assistant-response', { detail }));
        if (typeof state.config?.onResponse === 'function') {
            state.config.onResponse(detail);
        }
    };

    const deleteHistoryEntry = async (historyId) => {
        if (!state.config || !historyId || !canManageHistory() || !supportsHistoryDeletion() || state.sending || state.deletingHistoryId) {
            if (!supportsHistoryDeletion()) {
                window.alert('当前线上 AI 后端还是旧版本，删除历史接口还没部署。请先重新部署 Supabase Edge Function `ai-assistant`。');
            }
            return;
        }

        const confirmed = window.confirm('确定删除这条 AI 历史对话吗？删除后不能恢复。');
        if (!confirmed) return;

        state.deletingHistoryId = historyId;
        renderHistory();

        try {
            const data = await requestService(state.config, {
                action: 'delete-history',
                historyId,
                actorRole: getActorRole()
            });

            state.serviceStatus = data;
            state.history = Array.isArray(data.history) ? data.history : state.history.filter((entry) => entry.id !== historyId);
            renderServiceStatus();
            renderHistory();
        } catch (error) {
            const message = error.message === '问题不能为空。'
                ? '当前线上 AI 后端还是旧版本，删除历史接口还没部署。请先重新部署 Supabase Edge Function `ai-assistant`。'
                : (error.message || '删除 AI 历史失败，请稍后重试。');
            window.alert(message);
        } finally {
            state.deletingHistoryId = null;
            renderHistory();
        }
    };

    const sendQuestion = async ({ question, actionMode }) => {
        if (!state.config || !state.refs) return;

        const resolvedQuestion = compactText(question || state.refs.input.value);
        const resolvedActionMode = actionMode || 'general';

        if (!resolvedQuestion) {
            state.refs.input.focus();
            return;
        }

        const previousHistory = state.history.slice();
        const context = buildContext(state.config, resolvedActionMode);

        state.history = [{
            page_type: state.config.pageType,
            page_key: resolvePageKey(state.config),
            actor_role: getActorRole(),
            context_scope: context.scope,
            context_title: context.title,
            user_question: resolvedQuestion,
            ai_answer: 'AI 正在整理当前页面的公开内容，请稍等...',
            created_at: new Date().toISOString(),
            pending: true
        }].concat(previousHistory).slice(0, 10);

        state.sending = true;
        renderHistory();
        updateSendState();

        try {
            const data = await requestService(state.config, {
                action: 'chat',
                actionMode: resolvedActionMode,
                pageType: state.config.pageType,
                pageKey: resolvePageKey(state.config),
                actorRole: getActorRole(),
                question: resolvedQuestion,
                context
            });

            state.serviceStatus = data;
            state.history = Array.isArray(data.history) ? data.history : previousHistory;
            renderServiceStatus();
            renderHistory();
            state.refs.input.value = '';

            dispatchResponseEvent({
                pageType: state.config.pageType,
                pageKey: resolvePageKey(state.config),
                actionMode: resolvedActionMode,
                question: resolvedQuestion,
                answer: data.answer || '',
                structuredData: data.structuredData || null,
                history: state.history
            });
        } catch (error) {
            state.history = [{
                page_type: state.config.pageType,
                page_key: resolvePageKey(state.config),
                actor_role: getActorRole(),
                context_scope: context.scope,
                context_title: context.title,
                user_question: resolvedQuestion,
                ai_answer: error.message || '当前无法连接统一 AI 服务，请稍后再试。',
                created_at: new Date().toISOString()
            }].concat(previousHistory).slice(0, 10);
            renderHistory();
        } finally {
            state.sending = false;
            updateSendState();
            renderContextPreview('general');
        }
    };

    const renderQuickActions = () => {
        return defaultQuickActions(state.config?.pageType);
    };

    const toggleSettingsPanel = async () => {
        if (!canShowSettingsEntry()) return;

        state.settingsOpen = !state.settingsOpen;
        renderShellMode();

        if (state.settingsOpen) {
            try {
                await fetchServiceStatusInternal({ panelLoading: true });
            } catch (error) {
                // status text is already updated in renderSettingsStatus
            }
            return;
        }

        setTimeout(() => state.refs?.input?.focus(), 40);
    };

    const closePanel = () => {
        state.refs?.shell.classList.remove('open');
    };

    const openPanel = async (options = {}) => {
        if (!state.refs || !state.config) return;

        state.settingsOpen = false;
        renderShellMode();
        state.refs.shell.classList.add('open');
        if (options.prompt) {
            state.refs.input.value = options.prompt;
        }
        renderContextPreview(options.actionMode || 'general');

        if (!state.history.length && !state.sending) {
            try {
                await loadHistory();
            } catch (error) {
                // leave current UI message in place
            }
        }

        if (options.sendNow) {
            sendQuestion({
                question: options.prompt || state.refs.input.value,
                actionMode: options.actionMode || 'general'
            });
        } else {
            setTimeout(() => state.refs.input.focus(), 40);
        }
    };

    const bindEvents = () => {
        const { refs } = state;
        if (!refs) return;

        refs.fab.addEventListener('click', () => openPanel());
        refs.close.addEventListener('click', closePanel);
        refs.overlay.addEventListener('click', closePanel);
        refs.settingsBtn.addEventListener('click', () => toggleSettingsPanel());
        refs.sendBtn.addEventListener('click', () => sendQuestion({ actionMode: 'general' }));
        refs.historyList.addEventListener('click', (event) => {
            if (!(event.target instanceof Element)) return;
            const trigger = event.target.closest('[data-action="delete-history"]');
            if (!trigger) return;

            const historyId = Number(trigger.dataset.historyId || 0);
            if (!historyId) return;
            deleteHistoryEntry(historyId);
        });
        refs.input.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                sendQuestion({ actionMode: 'general' });
            }
        });
        window.addEventListener('lcq-admin-auth-changed', () => {
            renderShellMode();
            renderHistory();
        });
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closePanel();
        });
    };

    const init = (config) => {
        if (!config?.supabaseUrl || !config?.supabaseAnonKey || !config?.pageType) {
            throw new Error('LCQAiAssistant.init 缺少必要配置。');
        }

        if (state.initialized && state.refs?.shell) {
            state.refs.shell.remove();
        }

        state.initialized = true;
        state.config = {
            functionName: 'ai-assistant',
            ...config
        };
        state.history = [];
        state.serviceStatus = null;
        state.sending = false;
        state.settingsOpen = false;
        state.settingsLoading = false;
        state.deletingHistoryId = null;
        state.refs = createShell(state.config);

        renderContextPreview('general');
        renderShellMode();
        renderHistory();
        renderServiceStatus();
        bindEvents();
        updateSendState();

        fetchServiceStatusInternal()
            .then((data) => {
                return data;
            })
            .catch(() => undefined);

        window.dispatchEvent(new CustomEvent('lcq-ai-assistant-ready', {
            detail: {
                pageType: state.config.pageType
            }
        }));
    };

    window.LCQAiAssistant = {
        init,
        open(options = {}) {
            return openPanel(options);
        },
        refreshContext(actionMode = 'general') {
            renderContextPreview(actionMode);
        },
        refreshHistory() {
            return loadHistory();
        },
        async fetchServiceStatus() {
            return fetchServiceStatusInternal({ panelLoading: state.settingsOpen });
        },
        getState() {
            return {
                pageType: state.config?.pageType || null,
                history: state.history.slice(),
                serviceStatus: state.serviceStatus,
                initialized: state.initialized,
                deletingHistoryId: state.deletingHistoryId
            };
        }
    };
})();
