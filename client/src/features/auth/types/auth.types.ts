export type User = { id: string; name: string; email: string };
export type AuthResponse = { accessToken: string; expiresIn: number; user: User };
