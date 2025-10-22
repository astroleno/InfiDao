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
    const startTime = Date.now();
    const url = `${this.baseURL}${endpoint}`;
    const config: RequestInit = {
      headers: { ...this.defaultHeaders, ...options.headers },
      ...options,
    };

    try {
      console.log(`🚀 API Request [${endpoint}] started`);

      const response = await fetch(url, config);

      if (!response.ok) {
        const responseTime = Date.now() - startTime;
        console.error(`❌ API Error [${endpoint}] (${responseTime}ms): ${response.status} ${response.statusText}`);
        throw new Error(`API request failed: ${response.statusText} (${response.status})`);
      }

      const data: ApiResponse<T> = await response.json();
      const responseTime = Date.now() - startTime;

      console.log(`✅ API Success [${endpoint}] (${responseTime}ms)`);

      // Log performance warnings
      if (responseTime > 3000) {
        console.warn(`⚠️ Slow API response [${endpoint}] (${responseTime}ms) - consider optimization`);
      }

      return data;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`❌ API Error [${endpoint}] (${responseTime}ms):`, error);
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
  async streamAnnotation(
    request: AnnotateRequest,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<Response> {
    const startTime = Date.now();
    const url = `${this.baseURL}/api/annotate`;

    try {
      console.log(`🌊 Streaming API Request [/api/annotate] started`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(request),
        signal: abortSignal,
      });

      if (!response.ok) {
        const responseTime = Date.now() - startTime;
        console.error(`❌ Streaming API Error (${responseTime}ms): ${response.status} ${response.statusText}`);
        throw new Error(`Streaming annotation failed: ${response.statusText} (${response.status})`);
      }

      console.log(`✅ Streaming API Connected (${Date.now() - startTime}ms)`);
      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (error.name === 'AbortError') {
        console.log(`⏹️ Streaming API Cancelled (${responseTime}ms)`);
      } else {
        console.error(`❌ Streaming API Error (${responseTime}ms):`, error);
      }
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