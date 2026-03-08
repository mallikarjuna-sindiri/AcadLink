/* eslint-disable react-hooks/set-state-in-effect, react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedToken = localStorage.getItem('acadlink_token');
        const savedUser = localStorage.getItem('acadlink_user');
        if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    const login = (tokenValue, userData) => {
        localStorage.setItem('acadlink_token', tokenValue);
        localStorage.setItem('acadlink_user', JSON.stringify(userData));
        setToken(tokenValue);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('acadlink_token');
        localStorage.removeItem('acadlink_user');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
