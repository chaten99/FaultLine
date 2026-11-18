import type { InferSchemaType } from "mongoose";
import type { Monitor } from "./monitor.model.js";
import { executeMonitorHttpCheck, type CheckExecutionOutcome } from "./monitor-executor.service.js";
import { executeTlsCheck } from "./tls-executor.service.js";
import { executeDnsCheck } from "./dns-executor.service.js";
import { executeDomainCheck } from "./domain-executor.service.js";
import { httpConfigSchema, dnsConfigSchema } from "./advanced.validation.js";
import { decodeMonitorSecrets, secretContext } from "./monitor-credentials.service.js";
import { Monitor as MonitorModel } from "./monitor.model.js";
export const executeAdvancedCheck = async (
  monitor: InferSchemaType<typeof Monitor.schema> & { _id: unknown },
): Promise<CheckExecutionOutcome> => {
  switch (monitor.type) {
    case "tls":
      return executeTlsCheck(monitor.url, monitor.timeoutMs, monitor.tlsConfig?.warningDays ?? 30);
    case "dns":
      return executeDnsCheck(
        monitor.url,
        dnsConfigSchema.parse(JSON.parse(JSON.stringify(monitor.dnsConfig))),
        monitor.timeoutMs,
      );
    case "domain":
      return executeDomainCheck(
        monitor.url,
        monitor.domainConfig?.warningDays ?? 30,
        monitor.timeoutMs,
      );
    default: {
      try {
        const config = monitor.httpConfig
          ? httpConfigSchema.parse(JSON.parse(JSON.stringify(monitor.httpConfig)))
          : undefined;
        const stored = config
          ? await MonitorModel.findOne({
              _id: monitor._id,
              workspaceId: monitor.workspaceId,
              configRevision: monitor.configRevision,
            }).select("+encryptedSecrets")
          : null;
        if (config && !stored) throw new Error("Monitor configuration changed");
        const secrets = decodeMonitorSecrets(
          stored?.encryptedSecrets,
          secretContext(String(monitor.workspaceId), String(monitor._id)),
        );
        return executeMonitorHttpCheck({
          url: monitor.url,
          timeoutMs: monitor.timeoutMs,
          expectedStatusCodes: monitor.expectedStatusCodes,
          method: monitor.method,
          httpConfig: config,
          secrets,
        });
      } catch {
        return {
          success: false,
          durationMs: 0,
          nonQualifying: true,
          failureCategory: "INVALID_CONFIGURATION",
          errorMessage: "Monitor credentials or configuration are unavailable.",
        };
      }
    }
  }
};
