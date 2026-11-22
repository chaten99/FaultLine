import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MonitorForm } from "./monitor-form";
import { AdvancedHttpFields, emptyHttpConfig, validateHttpForm } from "./advanced-http-fields";
import { ProtocolDetailsView } from "./protocol-details";
import { monitorFormSchema } from "../schemas/monitor.schema";
import { maintenanceRangeError, maintenanceInput } from "@/features/maintenance/maintenance-page";
import type { Monitor } from "../api/monitors.api";
const monitor: Monitor = {
  _id: "id",
  name: "API",
  url: "https://example.com",
  type: "http",
  method: "GET",
  intervalSeconds: 300,
  timeoutMs: 10000,
  expectedStatusCodes: [200],
  active: true,
  createdAt: "2026-11-17",
  updatedAt: "2026-11-17",
};
const render = (element: React.ReactNode) =>
  renderToStaticMarkup(<TooltipProvider>{element}</TooltipProvider>);
describe("advanced monitor forms", () => {
  it("preserves the simple GET experience and progressive advanced settings", () => {
    const html = render(
      <MonitorForm mode="create" onSubmit={async () => {}} onCancel={() => {}} />,
    );
    expect(html).toContain("Monitoring type");
    expect(html).toContain("Advanced settings");
    expect(html).toContain("Create monitor");
  });
  it.each(["http", "tls", "dns", "domain"] as const)(
    "renders actual %s configuration fields",
    (type) => {
      const html = render(
        <MonitorForm
          mode="edit"
          initialData={{
            ...monitor,
            type,
            url: type === "dns" || type === "domain" ? "example.com" : monitor.url,
          }}
          onSubmit={async () => {}}
          onCancel={() => {}}
        />,
      );
      expect(html).toContain(
        type === "http"
          ? "Authentication"
          : type === "dns"
            ? "DNS record type"
            : "Warn when expiry is within",
      );
      if (type !== "http") expect(html).not.toContain("Bearer token");
    },
  );
  it("renders saved credential state without existing values", () => {
    const html = render(
      <AdvancedHttpFields
        value={{
          ...emptyHttpConfig,
          authType: "bearer",
          credentialsSaved: true,
          headers: [{ name: "x-api-key", secret: true, saved: true }],
        }}
        onChange={() => {}}
        method="GET"
      />,
    );
    expect(html).toContain("Credentials saved");
    expect(html).toContain('type="password"');
    expect(html).toContain("Remove header");
    expect(html).not.toContain("Request body (maximum");
  });
  it("supports Basic, custom headers, body format and case sensitivity", () => {
    const html = render(
      <AdvancedHttpFields
        value={{ ...emptyHttpConfig, authType: "basic" }}
        onChange={() => {}}
        method="POST"
      />,
    );
    for (const label of [
      "Username",
      "Password",
      "Body format",
      "Request body",
      "Case sensitive",
      "JSON response assertions",
    ])
      expect(html).toContain(label);
  });
  it("validates JSON syntax, byte limits and GET body removal", () => {
    expect(validateHttpForm({ ...emptyHttpConfig, body: "{" }, "POST")).toContain("valid JSON");
    expect(validateHttpForm({ ...emptyHttpConfig, body: "x" }, "GET")).toContain("Remove");
    expect(
      validateHttpForm(
        { ...emptyHttpConfig, contentType: "text/plain", body: "é".repeat(5000) },
        "POST",
      ),
    ).toContain("8 KB");
    expect(
      validateHttpForm({ ...emptyHttpConfig, body: '{"status":"ok"}' }, "POST"),
    ).toBeUndefined();
  });
  it("accepts all 2xx explicit codes and real monitor methods", () => {
    const values = {
      ...monitor,
      expectedStatusCodes: Array.from({ length: 100 }, (_, i) => 200 + i).join(", "),
      failureThreshold: 3,
      recoveryThreshold: 2,
    };
    expect(monitorFormSchema.safeParse(values).success).toBe(true);
    expect(monitorFormSchema.safeParse({ ...values, method: "POST" }).success).toBe(true);
    expect(
      monitorFormSchema.safeParse({ ...values, type: "http", url: "example.com" }).success,
    ).toBe(false);
    expect(
      monitorFormSchema.safeParse({ ...values, type: "dns", url: "example.com" }).success,
    ).toBe(true);
  });
});
describe("protocol check details", () => {
  it("presents HTTP assertion failures separately from HTTP status", () => {
    const html = render(
      <ProtocolDetailsView
        details={{
          method: "POST",
          authType: "bearer",
          expectedStatusCodes: [201],
          assertionResults: [
            { index: 0, passed: false, message: "JSON assertion path is missing." },
          ],
        }}
      />,
    );
    expect(html).toContain("Expected HTTP statuses");
    expect(html).toContain("JSON assertion path is missing");
    expect(html).toContain("bearer");
  });
  it("presents persisted TLS, DNS and domain provider metadata", () => {
    const html = render(
      <ProtocolDetailsView
        details={{
          certificateValid: true,
          hostnameValid: true,
          issuer: "Test CA",
          daysRemaining: 7,
          recordType: "MX",
          values: ["10 mail.example.com"],
          provider: "registry.example",
          lastSuccessfulLookup: "2026-11-17T12:00:00Z",
          expiryDate: "2027-01-01T00:00:00Z",
        }}
      />,
    );
    for (const text of [
      "Certificate valid",
      "Test CA",
      "Days remaining",
      "MX",
      "registry.example",
      "Last successful lookup",
    ])
      expect(html).toContain(text);
  });
  it("handles absent result data without invented measurements", () =>
    expect(render(<ProtocolDetailsView />)).toBe(""));
  it("strips read-only fields when editing maintenance", () => {
    const input = {
      title: "Release",
      description: "",
      monitorIds: [],
      startAt: "2026-11-17T12:00:00Z",
      endAt: "2026-11-17T13:00:00Z",
      timezone: "UTC",
      recurrence: "once" as const,
      enabled: true,
      notifyDuring: false,
      notifyAfter: true,
      _id: "read-only",
      state: "upcoming",
      workspaceId: "server-owned",
    };
    expect(maintenanceInput(input)).not.toHaveProperty("_id");
    expect(maintenanceInput(input)).not.toHaveProperty("workspaceId");
  });
  it("rejects invalid or oversized maintenance ranges", () => {
    expect(maintenanceRangeError("invalid", "2026-11-17")).toBeDefined();
    expect(maintenanceRangeError("2026-11-17", "2026-11-16")).toBeDefined();
    expect(maintenanceRangeError("2026-11-17", "2026-11-18")).toBeUndefined();
  });
});
