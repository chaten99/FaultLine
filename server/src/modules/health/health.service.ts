export type HealthStatus = {
  status: "ok";
  service: "faultline-api";
  timestamp: string;
  uptimeSeconds: number;
};

export const getHealthStatus = (): HealthStatus => ({
  status: "ok",
  service: "faultline-api",
  timestamp: new Date().toISOString(),
  uptimeSeconds: Math.floor(process.uptime()),
});
