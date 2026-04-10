/// <reference types="vite/client" />

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface LoginResponse {
  user: unknown
  session: { access_token: string }
  message: string
}

interface RegisterResponse {
  user: unknown
  message: string
}

function getAuthToken(): string | null {
  return localStorage.getItem('authToken')
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const headers = {
    ...options?.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null)
    if (
      typeof errorBody === 'object' &&
      errorBody !== null &&
      'error' in errorBody &&
      typeof (errorBody as { error?: unknown }).error === 'string'
    ) {
      throw new Error((errorBody as { error: string }).error)
    }
    throw new Error('Network response was not ok')
  }

  return response.json() as Promise<T>
}

export const api = {
  health: async () => {
    return fetchAPI<{ status: string; message: string }>('health')
  },

  auth: {
    login: async (email: string, password: string) => {
      return fetchAPI<LoginResponse>('auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    },
    register: async (email: string, password: string) => {
      return fetchAPI<RegisterResponse>('auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    },
  },

  documents: {
    list: async () => {
      return fetchAPI<any[]>('documents')
    },
    get: async (id: string) => {
      return fetchAPI<any>(`documents/${id}`)
    },
    create: async (title: string) => {
      return fetchAPI<any>('documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    },
    update: async (id: string, data: any) => {
      return fetchAPI<any>(`documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
    delete: async (id: string) => {
      return fetchAPI<any>(`documents/${id}`, {
        method: 'DELETE',
      })
    },
  },
}