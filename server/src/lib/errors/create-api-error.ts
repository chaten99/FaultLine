export type ApiErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_REQUEST"
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_REFRESH_TOKEN"
  | "INTERNAL_ERROR"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_OTP"
  | "OTP_RATE_LIMITED"
  | "OTP_COOLDOWN"
  | "OTP_DELIVERY_FAILED"
  | "INVALID_RESET_GRANT"
  | "LOGIN_VERIFICATION_REQUIRED";

export type ApiError = Error & {
  statusCode: number;
  code: ApiErrorCode;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
};

export const createApiError = (
  message: string,
  statusCode: number,
  code: ApiErrorCode,
  fieldErrors?: Record<string, string>,
  data?: Record<string, unknown>,
): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  if (fieldErrors) error.fieldErrors = fieldErrors;
  if (data) error.data = data;
  return error;
};
