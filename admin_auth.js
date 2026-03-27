(function () {
    const STORAGE_KEY = 'lcq_user_auth_state_v4';
    const EXPIRES_MS = 12 * 60 * 60 * 1000;
    const LEGACY_STORAGE_KEYS = ['lcq_user_auth_state_v3', 'lcq_user_auth_state_v2', 'lcq_admin_auth_state_v1'];

    const ROLE_META = {
        dad: { label: '爸', passwordRequired: true, passwords: ['787304'] },
        mom: { label: '妈', passwordRequired: true, passwords: ['787304'] },
        friend: { label: 'friend', passwordRequired: false, passwords: [] },
        admin: { label: '管理员', passwordRequired: true, passwords: ['lcqbr'] },
        xiaobao: { label: '方小宝', passwordRequired: false, passwords: [], hidden: true }
    };
    const PRIVILEGED_ROLES = ['admin', 'xiaobao'];
    const FAMILY_VIEW_ROLES = ['dad', 'mom', 'admin', 'xiaobao'];

    const readSession = () => {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null;
        } catch (error) {
            return null;
        }
    };

    const writeSession = (payload) => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    };

    const clearLegacySessions = () => {
        LEGACY_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
    };

    const normalizeRole = (role) => {
        const raw = String(role || '').trim().toLowerCase();
        if (raw === '爸' || raw === 'dad') return 'dad';
        if (raw === '妈' || raw === 'mom') return 'mom';
        if (raw === 'friend') return 'friend';
        if (raw === '管理员' || raw === 'admin') return 'admin';
        if (raw === '方小宝' || raw === 'xiaobao') return 'xiaobao';
        return '';
    };

    const buildSessionPayload = (role) => ({
        role,
        roleLabel: ROLE_META[role].label,
        authenticated: PRIVILEGED_ROLES.includes(role),
        expiresAt: Date.now() + EXPIRES_MS
    });

    const clearExpiredAuth = () => {
        const state = readSession();
        const role = state && normalizeRole(state.role);
        if (!state || !role || !ROLE_META[role] || !state.expiresAt || state.expiresAt <= Date.now()) {
            sessionStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return {
            ...state,
            role,
            roleLabel: ROLE_META[role].label
        };
    };

    const emitChange = () => {
        window.dispatchEvent(new CustomEvent('lcq-admin-auth-changed', {
            detail: window.LCQAdminAuth.getState()
        }));
    };

    const hasValidRole = (state, roles) => {
        if (!state || !state.role) return false;
        const normalizedRoles = (Array.isArray(roles) ? roles : [roles])
            .map(normalizeRole)
            .filter(Boolean);
        return normalizedRoles.includes(state.role);
    };

    window.LCQAdminAuth = {
        authenticate(roleOrPassword, maybePassword) {
            let role = normalizeRole(roleOrPassword);
            let password = String(maybePassword || '').trim();

            // 兼容旧调用：authenticate(password) 默认按管理员登录处理
            if (!role) {
                role = 'admin';
                password = String(roleOrPassword || '').trim();
            }

            const meta = ROLE_META[role];
            if (!meta) {
                return { ok: false, message: '请选择有效角色。' };
            }

            if (meta.hidden) {
                return { ok: false, message: '该身份不可通过普通登录入口使用。' };
            }

            if (meta.passwordRequired && !meta.passwords.includes(password)) {
                return { ok: false, message: '密码错误，请重试。' };
            }

            writeSession(buildSessionPayload(role));

            emitChange();
            return {
                ok: true,
                role,
                roleLabel: meta.label,
                isAdmin: PRIVILEGED_ROLES.includes(role)
            };
        },

        authenticateHiddenRole(secret) {
            if (String(secret || '').trim() !== 'fylcq') {
                return { ok: false, message: '隐藏身份口令错误。' };
            }

            writeSession(buildSessionPayload('xiaobao'));
            emitChange();
            return {
                ok: true,
                role: 'xiaobao',
                roleLabel: ROLE_META.xiaobao.label,
                isAdmin: true
            };
        },

        logout() {
            sessionStorage.removeItem(STORAGE_KEY);
            emitChange();
        },

        isLoggedIn() {
            return !!clearExpiredAuth();
        },

        isAuthenticated() {
            const state = clearExpiredAuth();
            return !!(state && PRIVILEGED_ROLES.includes(state.role));
        },

        hasRole(roles) {
            const state = clearExpiredAuth();
            return hasValidRole(state, roles);
        },

        canEditContent() {
            return this.hasRole(PRIVILEGED_ROLES);
        },

        canViewFamilyMessages() {
            return this.hasRole(FAMILY_VIEW_ROLES);
        },

        canAccessSecretBoardWithoutPassword() {
            return this.hasRole(PRIVILEGED_ROLES);
        },

        getState() {
            const state = clearExpiredAuth();
            if (!state) {
                return {
                    loggedIn: false,
                    authenticated: false,
                    role: null,
                    roleLabel: null,
                    expiresAt: null
                };
            }

            return {
                loggedIn: true,
                authenticated: PRIVILEGED_ROLES.includes(state.role),
                role: state.role,
                roleLabel: state.roleLabel || ROLE_META[state.role]?.label || null,
                expiresAt: state.expiresAt
            };
        },

        requireAuth(message) {
            if (this.isAuthenticated()) return true;
            alert(message || '请先完成用户登录，并选择管理员角色。');
            return false;
        },

        requireLogin(message, roles) {
            if (!roles && this.isLoggedIn()) return true;
            if (roles && this.hasRole(roles)) return true;
            alert(message || '请先完成用户登录。');
            return false;
        },

        config: {
            storageKey: STORAGE_KEY,
            expiresHours: EXPIRES_MS / (60 * 60 * 1000),
            roles: Object.fromEntries(
                Object.entries(ROLE_META).map(([key, value]) => [key, {
                    label: value.label,
                    passwordRequired: value.passwordRequired,
                    hidden: !!value.hidden
                }])
            )
        }
    };

    clearLegacySessions();
    emitChange();
})();
