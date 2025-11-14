import { jwtDecode } from 'jwt-decode';

const TOKEN_KEY = 'accessToken';

export const getAccessToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setAccessToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeAccessToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = jwtDecode<{ exp: number }>(token);
    const currentTime = Date.now() / 1000;
    // Check if token expires in next 30 seconds (refresh early)
    return decoded.exp < currentTime + 30;
  } catch {
    return true;
  }
};
