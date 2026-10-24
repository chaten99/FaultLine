import type { Request } from "express";

export type AuthenticatedRequest = Request & { userId?: string };

export type SafeUser = {
  id: string;
  name: string;
  email: string;
};

export type AuthResult = {
  user: SafeUser;
  accessToken: string;
  expiresIn: number;
};
