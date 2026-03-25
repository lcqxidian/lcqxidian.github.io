(function () {
    const STORAGE_KEY = 'lcq_admin_auth_state_v1';
    const ADMIN_PASSWORD = 'lcqbr';
    const EXPIRES_MS = 12 * 60 * 60 * 1000;

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

    const emitChange = () => {
        window.dispatchEvent(new CustomEvent('lcq-admin-auth-changed', {
            detail: window.LCQAdminAuth.getState()
        }));
    };

    const clearExpiredAuth = () => {
        const state = readSession();
        if (!state || !state.expiresAt || state.expiresAt <= Date.now()) {
            sessionStorage.removeItem(STORAGE_KEY);
            return false;
        }
        return true;
    };

    window.LCQAdminAuth = {
        authenticate(password) {
            if (password !== ADMIN_PASSWORD) {
                return { ok: false, message: '密码错误，请重试。' };
            }

            writeSession({
                authenticated: true,
                expiresAt: Date.now() + EXPIRES_MS
            });
            emitChange();
            return { ok: true };
        },

        logout() {
            sessionStorage.removeItem(STORAGE_KEY);
            emitChange();
        },

        isAuthenticated() {
            return clearExpiredAuth();
        },

        getState() {
            const authenticated = clearExpiredAuth();
            const state = readSession();
            return {
                authenticated,
                expiresAt: authenticated && state ? state.expiresAt : null
            };
        },

        requireAuth(message) {
            if (this.isAuthenticated()) return true;
            alert(message || '请先完成管理员认证。');
            return false;
        },

        config: {
            storageKey: STORAGE_KEY,
            defaultPassword: ADMIN_PASSWORD,
            expiresHours: EXPIRES_MS / (60 * 60 * 1000)
        }
    };

    emitChange();
})();
