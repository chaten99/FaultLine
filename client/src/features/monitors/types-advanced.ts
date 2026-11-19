export type MonitorType = "http" | "tls" | "dns" | "domain";
export type JsonAssertion = {
  path: string;
  operator: "exists" | "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  value?: string | number | boolean | null;
};
export type HttpConfig = {
  authType: "none" | "bearer" | "basic" | "custom";
  token?: string;
  username?: string;
  password?: string;
  credentialsSaved?: boolean;
  headers: Array<{ name: string; value?: string; secret: boolean; saved?: boolean }>;
  contentType: "application/json" | "text/plain";
  body?: string | null;
  bodySaved?: boolean;
  keyword?: { text: string; caseSensitive: boolean };
  assertions: JsonAssertion[];
};
export type DnsConfig = {
  recordType: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";
  expectedValues: string[];
  comparison: "includes" | "exact";
};
export type ProtocolDetails = {
  method?: string;
  destination?: string;
  authType?: string;
  expectedStatusCodes?: number[];
  assertionResults?: Array<{ index: number; passed: boolean; message: string }>;
  certificateExpiresAt?: string;
  validFrom?: string;
  daysRemaining?: number;
  issuer?: string;
  subject?: string;
  subjectAltNames?: string[];
  hostnameValid?: boolean;
  certificateValid?: boolean;
  hostname?: string;
  recordType?: string;
  values?: string[];
  expectedValues?: string[];
  classification?: string;
  provider?: string;
  lastSuccessfulLookup?: string;
  expiryDate?: string;
};
