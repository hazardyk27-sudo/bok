export type AccountUser = {
  id: string;
  email: string;
  username: string;
  userCode: string;
  balanceCents: number;
  createdAt: string;
};

type AuthResponse = {
  user: AccountUser | null;
};

export class AuthApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
    [key: string]: unknown;
  };

  if (!response.ok) {
    const code =
      typeof body.error === "string" ? body.error : "AUTH_REQUEST_FAILED";
    throw new AuthApiError(code, response.status);
  }

  return body as T;
}

export const accountApi = {
  async me() {
    return request<AuthResponse>("/auth/me");
  },

  async register(email: string, username: string, password: string) {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    });
  },

  async login(identifier: string, password: string) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return request<AuthResponse>("/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async logout() {
    await request<void>("/auth/logout", {
      method: "POST",
      body: "{}",
    });
  },
};
