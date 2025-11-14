import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, isTokenExpired, removeAccessToken, setAccessToken } from '@/shared/lib';

interface RetryableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:50051';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track if refresh is in progress
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve();
    }
  });

  failedQueue = [];
};

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();

    // Skip token check for refresh endpoint
    if (config.url?.includes('/auth/refresh')) {
      return config;
    }

    if (token) {
      // Check if token is expired
      if (isTokenExpired(token)) {
        if (!isRefreshing) {
          isRefreshing = true;

          try {
            const response = await axios.post(
              `${API_URL}/auth/refresh`,
              {},
              { withCredentials: true }
            );

            const { accessToken } = response.data;
            setAccessToken(accessToken);
            isRefreshing = false;
            processQueue();

            config.headers.Authorization = `Bearer ${accessToken}`;
          } catch (error) {
            isRefreshing = false;
            processQueue(error as Error);
            removeAccessToken();
            window.location.href = '/login';
            return Promise.reject(error);
          }
        } else {
          // Wait for refresh to complete
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then(() => {
              config.headers.Authorization = `Bearer ${getAccessToken()}`;
              return config;
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }
      } else {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (!error.config) {
      return Promise.reject(error);
    }

    const originalRequest: RetryableRequest = error.config;

    // If 401 and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/refresh')) {
        // Refresh token is invalid, redirect to login
        removeAccessToken();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;

        try {
          const response = await axios.post(
            `${API_URL}/auth/refresh`,
            {},
            { withCredentials: true }
          );

          const { accessToken } = response.data;
          setAccessToken(accessToken);
          isRefreshing = false;
          processQueue();

          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          isRefreshing = false;
          processQueue(refreshError as Error);
          removeAccessToken();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        // Wait for refresh to complete
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            originalRequest.headers.Authorization = `Bearer ${getAccessToken()}`;
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
