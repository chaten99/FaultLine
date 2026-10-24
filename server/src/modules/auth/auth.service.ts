import argon2 from "argon2";
import { User } from "./user.model.js";
import { createAccessToken } from "./auth-token.service.js";
import {
  issueRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  rotateRefreshToken,
} from "./refresh-token.service.js";
import type { AuthResult, SafeUser } from "./auth.types.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { startLoginVerification } from "./otp.service.js";

const toSafeUser = (user: { _id: unknown; name: string; email: string }): SafeUser => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
});

const resultFor = async (user: {
  _id: unknown;
  name: string;
  email: string;
}): Promise<AuthResult> => ({
  user: toSafeUser(user),
  accessToken: createAccessToken(String(user._id)),
  expiresIn: 600,
});

export const createSessionForUser = async (user: {
  _id: unknown;
  name: string;
  email: string;
}): Promise<AuthResult & { refreshToken: string }> => ({
  ...(await resultFor(user)),
  refreshToken: await issueRefreshToken(String(user._id)),
});

export const registerUser = async (input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string; email: string }> => {
  const email = input.email.toLowerCase();
  let user;
  try {
    user = await User.create({
      name: input.name,
      email,
      passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      throw createApiError(
        "An account with this email already exists.",
        409,
        "EMAIL_ALREADY_EXISTS",
        { email: "An account with this email already exists." },
      );
    }
    throw error;
  }
  return { userId: String(user._id), email };
};

export const loginUser = async (input: {
  email: string;
  password: string;
  ipAddress: string;
}): Promise<AuthResult & { refreshToken: string }> => {
  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await argon2.verify(user.passwordHash, input.password)))
    throw createApiError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  if (!user.emailVerifiedAt)
    throw createApiError(
      "Verify your email to finish signing in.",
      403,
      "LOGIN_VERIFICATION_REQUIRED",
      undefined,
      await startLoginVerification({
        id: String(user._id),
        email: user.email,
        name: user.name,
        ipAddress: input.ipAddress,
      }),
    );
  return createSessionForUser(user);
};

export const refreshUser = async (
  token: string,
): Promise<AuthResult & { refreshToken: string }> => {
  const rotated = await rotateRefreshToken(token);
  const user = await User.findById(rotated.userId);
  if (!user)
    throw createApiError(
      "Your session has expired. Please sign in again.",
      401,
      "INVALID_REFRESH_TOKEN",
    );
  return { ...(await resultFor(user)), refreshToken: rotated.token };
};

export const getUser = async (userId: string): Promise<SafeUser | null> => {
  const user = await User.findById(userId);
  return user ? toSafeUser(user) : null;
};

export { revokeRefreshToken };
export { revokeAllRefreshTokens };

const isDuplicateEmailError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000 &&
  "keyPattern" in error &&
  typeof error.keyPattern === "object" &&
  error.keyPattern !== null &&
  "email" in error.keyPattern;
