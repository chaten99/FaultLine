import type { Request, Response } from "express";
import { workspaceOf } from "../workspaces/workspace-context.js";
import {
  incidentIdSchema,
  listIncidentsSchema,
  resolveIncidentSchema,
} from "./incident.validation.js";
import {
  acknowledgeIncident,
  getIncidentDetails,
  getIncidentsSummary,
  listIncidents,
  resolveIncidentManually,
} from "./incident.service.js";

const userId = workspaceOf;

export const list = async (request: Request, response: Response) => {
  const query = listIncidentsSchema.parse(request.query);
  return response.json(await listIncidents(userId(request), query));
};

export const summary = async (request: Request, response: Response) => {
  return response.json(await getIncidentsSummary(userId(request)));
};

export const get = async (request: Request, response: Response) => {
  const { id } = incidentIdSchema.parse(request.params);
  return response.json(await getIncidentDetails(userId(request), id));
};

export const acknowledge = async (request: Request, response: Response) => {
  const { id } = incidentIdSchema.parse(request.params);
  return response.json(await acknowledgeIncident(userId(request), id));
};

export const resolve = async (request: Request, response: Response) => {
  const { id } = incidentIdSchema.parse(request.params);
  const body = resolveIncidentSchema.parse(request.body);
  return response.json(await resolveIncidentManually(userId(request), id, body.reason));
};
