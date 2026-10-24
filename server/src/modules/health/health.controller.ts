import type { Request, Response } from "express";
import { getHealthStatus } from "./health.service.js";

export const getHealth = (_request: Request, response: Response): void => {
  response.status(200).json(getHealthStatus());
};
