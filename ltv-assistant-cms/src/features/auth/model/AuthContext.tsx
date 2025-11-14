import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import type { User } from '@/entities/user/model';
import { authApi } from '@/shared/api';
import { getAccessToken, removeAccessToken, setAccessToken } from '@/shared/lib';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  setAuthUser: (user: User, token: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state on mount
  useEffect(() => {
    const initializeAuth = async (retryCount = 0): Promise<void> => {
      const token = getAccessToken();

      if (token) {
        try {
          const { user: currentUser } = await authApi.getCurrentUser();
          setUser({
            id: currentUser.id.toString(),
            email: currentUser.email,
            name: currentUser.name,
            avatar: currentUser.avatar || undefined,
            role: currentUser.role,
          });
          setIsLoading(false);
        } catch (error: unknown) {
          // Check if it's an authentication error
          if (error instanceof AxiosError && error.response) {
            if (error.response.status === 401 || error.response.status === 403) {
              removeAccessToken();
              setIsLoading(false);
              return;
            }
          }

          // For network errors, retry up to 3 times with exponential backoff
          if (error instanceof AxiosError && !error.response && retryCount < 3) {
            const delay = Math.min(1000 * 2 ** retryCount, 5000);
            setTimeout(() => {
              initializeAuth(retryCount + 1);
            }, delay);
          } else {
            // Max retries reached or other error - keep token but stop loading
            setIsLoading(false);
          }
        }
      } else {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const loginWithGoogle = () => {
    authApi.loginWithGoogle();
  };

  const setAuthUser = (authUser: User, token: string) => {
    setAccessToken(token);
    setUser(authUser);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Silently fail - already logging out client-side
    } finally {
      removeAccessToken();
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      loginWithGoogle,
      logout,
      setAuthUser,
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
