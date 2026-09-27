export type AccountUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
};

type AuthResponse = {
  user: AccountUser | null;
  verificationEmailSent?: boolean;
  alreadyVerified?: boolean;
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

  async register(email: string, password: string) {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async login(email: string, password: string) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async resendVerification() {
    return request<AuthResponse>("/auth/resend-verification", {
      method: "POST",
      body: "{}",
    });
  },

  async logout() {
    await request<void>("/auth/logout", {
      method: "POST",
      body: "{}",
    });
  },
};
