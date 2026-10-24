export type ApiErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_REQUEST"
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_REFRESH_TOKEN"
  | "INTERNAL_ERROR";

export type ApiError = Error & {
  statusCode: number;
  code: ApiErrorCode;
  fieldErrors?: Record<string, string>;
};

export const createApiError = (
  message: string,
  statusCode: number,
  code: ApiErrorCode,
  fieldErrors?: Record<string, string>,
): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  if (fieldErrors) error.fieldErrors = fieldErrors;
  return error;
};
