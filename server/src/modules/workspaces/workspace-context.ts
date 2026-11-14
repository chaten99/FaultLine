import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { authenticate } from "../../middleware/authenticate.js";
import { can, type Permission } from "./workspace-permissions.js";
import { ensurePersonalWorkspace, resolveWorkspaceContext } from "./workspace-core.service.js";
import type { WorkspaceContext, WorkspaceRequest } from "./workspace.types.js";

const notFound = () => createApiError("Workspace not found.", 404, "WORKSPACE_NOT_FOUND");

export const workspaceContext = async (
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const typed = request as WorkspaceRequest;
    const userId = typed.userId;
    if (!userId) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
    const requested = request.header("x-workspace-id");
    const workspaceId = requested ?? String((await ensurePersonalWorkspace(userId))._id);
    const context = await resolveWorkspaceContext(userId, workspaceId);
    if (!context) throw notFound();
    typed.workspace = context;
    next();
  } catch (error) {
    next(error);
  }
};

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (request, _response, next) => {
    const context = (request as WorkspaceRequest).workspace;
    if (!context) {
      next(createApiError("Workspace not found.", 404, "WORKSPACE_NOT_FOUND"));
      return;
    }
    if (!can(context.role, permission)) {
      next(
        createApiError(
          "You don't have permission to do that in this workspace.",
          403,
          "INSUFFICIENT_PERMISSIONS",
        ),
      );
      return;
    }
    next();
  };

export const withWorkspace = (permission: Permission): RequestHandler[] => [
  authenticate,
  workspaceContext,
  requirePermission(permission),
];

export const workspaceFromParam = async (
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const typed = request as WorkspaceRequest;
    const userId = typed.userId;
    if (!userId) throw createApiError("Authentication required.", 401, "AUTHENTICATION_REQUIRED");
    const context = await resolveWorkspaceContext(userId, String(request.params.workspaceId ?? ""));
    if (!context) throw notFound();
    typed.workspace = context;
    next();
  } catch (error) {
    next(error);
  }
};

export const withWorkspaceParam = (permission: Permission): RequestHandler[] => [
  authenticate,
  workspaceFromParam,
  requirePermission(permission),
];

export const workspaceOf = (request: Request): WorkspaceContext => {
  const context = (request as WorkspaceRequest).workspace;
  if (!context) throw notFound();
  return context;
};
