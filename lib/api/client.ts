import { ApiResponse, SearchRequest, AnnotateRequest, EmbedRequest } from '@/types';

class ApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseURL: string = '') {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const config: RequestInit = {
      headers: { ...this.defaultHeaders, ...options.headers },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data: ApiResponse<T> = await response.json();
      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Search API
  async search(request: SearchRequest) {
    return this.request('/api/search', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Annotation API
  async annotate(request: AnnotateRequest) {
    return this.request('/api/annotate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Streaming Annotation API
  async streamAnnotation(request: AnnotateRequest): Promise<Response> {
    const url = `${this.baseURL}/api/annotate`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Streaming annotation failed: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error('Streaming API Error:', error);
      throw error;
    }
  }

  // Embedding API
  async embed(request: EmbedRequest) {
    return this.request('/api/embed', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Health Check API
  async healthCheck() {
    return this.request('/api/health');
  }

  // Generic GET request
  async get<T>(endpoint: string, params?: Record<string, any>) {
    const url = new URL(`${this.baseURL}${endpoint}`, window.location.origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    return this.request<T>(url.pathname + url.search);
  }

  // Generic POST request
  async post<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // Generic PUT request
  async put<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // Generic DELETE request
  async delete<T>(endpoint: string) {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }
}

// Create default instance
export const apiClient = new ApiClient();

// Export class for custom instances
export { ApiClient };

// Utility functions for common operations
export const api = {
  search: (request: SearchRequest) => apiClient.search(request),
  annotate: (request: AnnotateRequest) => apiClient.annotate(request),
  streamAnnotation: (request: AnnotateRequest) => apiClient.streamAnnotation(request),
  embed: (request: EmbedRequest) => apiClient.embed(request),
  healthCheck: () => apiClient.healthCheck(),
  get: <T>(endpoint: string, params?: Record<string, any>) => apiClient.get<T>(endpoint, params),
  post: <T>(endpoint: string, data?: any) => apiClient.post<T>(endpoint, data),
  put: <T>(endpoint: string, data?: any) => apiClient.put<T>(endpoint, data),
  delete: <T>(endpoint: string) => apiClient.delete<T>(endpoint),
};