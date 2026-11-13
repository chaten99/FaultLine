import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";
import { expectedEmailFromError, getWorkspaceErrorCode, workspaceErrorMessage } from "./messages";

const apiError = (status: number, data: Record<string, unknown>) =>
  new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
    statusText: "",
    headers: {},
    config: {} as AxiosResponse["config"],
  } as AxiosResponse);

describe("workspace error messages", () => {
  it("maps known codes to friendly messages", () => {
    expect(workspaceErrorMessage(apiError(403, { code: "INSUFFICIENT_PERMISSIONS" }))).toMatch(
      /permission/,
    );
    expect(workspaceErrorMessage(apiError(404, { code: "WORKSPACE_NOT_FOUND" }))).toMatch(
      /no longer available/,
    );
    expect(workspaceErrorMessage(apiError(409, { code: "INVITATION_EXISTS" }))).toMatch(
      /Resend or revoke/,
    );
    expect(workspaceErrorMessage(apiError(400, { code: "REAUTHENTICATION_REQUIRED" }))).toMatch(
      /password/,
    );
    expect(workspaceErrorMessage(apiError(429, { code: "RATE_LIMITED" }))).toMatch(/Too many/);
  });

  it("falls back to the server message and the generic message", () => {
    expect(
      workspaceErrorMessage(apiError(400, { code: "SOMETHING", message: "Custom server text." })),
    ).toBe("Custom server text.");
    expect(workspaceErrorMessage(new Error("boom"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("extracts error codes and the expected invitation email", () => {
    expect(getWorkspaceErrorCode(apiError(403, { code: "EMAIL_MISMATCH" }))).toBe("EMAIL_MISMATCH");
    expect(getWorkspaceErrorCode(new Error("x"))).toBeNull();
    expect(
      expectedEmailFromError(
        apiError(403, { code: "EMAIL_MISMATCH", data: { expectedEmailMasked: "a***@x.com" } }),
      ),
    ).toBe("a***@x.com");
    expect(expectedEmailFromError(apiError(403, { code: "EMAIL_MISMATCH" }))).toBeNull();
  });
});
