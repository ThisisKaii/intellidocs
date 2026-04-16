/// <reference types="vite/client" />

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface User {
  id: string
  email: string
}

export interface DocumentRecord {
  id: string
  user_id: string
  title: string
  content: string
  formatting_history: unknown[]
  created_at: string
  updated_at: string
}

interface LoginResponse {
  user: User
  session: { access_token: string }
  message: string
}

interface RegisterResponse {
  user: User
  message: string
}

interface UpdateDocumentRequest {
  title?: string
  content?: string
  formatting_history?: string[]
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

  if (response.status === 204) {
    return null as T
  }

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
  health: async (): Promise<{ status: string; message: string }> => {
    return fetchAPI<{ status: string; message: string }>('health')
  },

  auth: {
    login: async (email: string, password: string): Promise<LoginResponse> => {
      return fetchAPI<LoginResponse>('auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    },
    register: async (email: string, password: string): Promise<RegisterResponse> => {
      return fetchAPI<RegisterResponse>('auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    },
  },

  documents: {
    list: async (): Promise<DocumentRecord[]> => {
      return fetchAPI<DocumentRecord[]>('documents')
    },
    get: async (id: string): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>(`documents/${id}`)
    },
    create: async (title: string): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>('documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    },
    update: async (id: string, data: UpdateDocumentRequest): Promise<DocumentRecord> => {
      return fetchAPI<DocumentRecord>(`documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
    delete: async (id: string): Promise<null> => {
      return fetchAPI<null>(`documents/${id}`, {
        method: 'DELETE',
      })
    },
  },
}
