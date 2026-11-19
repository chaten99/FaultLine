import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HttpConfig, JsonAssertion } from "../types-advanced";
export const emptyHttpConfig: HttpConfig = {
  authType: "none",
  headers: [],
  contentType: "application/json",
  assertions: [],
};
export const validateHttpForm = (config: HttpConfig, method: string) => {
  if (method === "GET" && (config.body || (config.bodySaved && config.body !== null)))
    return "Remove the request body before selecting GET.";
  if (config.body && config.contentType === "application/json") {
    try {
      JSON.parse(config.body);
    } catch {
      return "Request body must be valid JSON.";
    }
  }
  if (config.body && new TextEncoder().encode(config.body).length > 8192)
    return "Request body cannot exceed 8 KB.";
  return undefined;
};
export function AdvancedHttpFields({
  value,
  onChange,
  method,
}: {
  value: HttpConfig;
  onChange: (v: HttpConfig) => void;
  method: string;
}) {
  const [visible, setVisible] = useState(false);
  const change = (next: Partial<HttpConfig>) => onChange({ ...value, ...next });
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="auth-type">Authentication</Label>
        <Select
          value={value.authType}
          onValueChange={(v) =>
            change({
              authType: v as HttpConfig["authType"],
              token: undefined,
              username: undefined,
              password: undefined,
            })
          }
        >
          <SelectTrigger id="auth-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["none", "bearer", "basic", "custom"].map((v) => (
              <SelectItem key={v} value={v}>
                {
                  {
                    none: "None",
                    bearer: "Bearer token",
                    basic: "Basic authentication",
                    custom: "Custom headers",
                  }[v]
                }
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value.credentialsSaved && (
          <p className="text-xs text-muted-foreground">
            Credentials saved. Leave blank to keep them, enter replacements, or select None to
            remove them.
          </p>
        )}
        {value.authType === "bearer" && (
          <>
            <Label htmlFor="bearer-token">Bearer token</Label>
            <Input
              id="bearer-token"
              autoComplete="off"
              type={visible ? "text" : "password"}
              value={value.token ?? ""}
              onChange={(e) => change({ token: e.target.value || undefined })}
            />
          </>
        )}
        {value.authType === "basic" && (
          <>
            <Label htmlFor="basic-user">Username</Label>
            <Input
              id="basic-user"
              autoComplete="off"
              value={value.username ?? ""}
              onChange={(e) => change({ username: e.target.value || undefined })}
            />
            <Label htmlFor="basic-password">Password</Label>
            <Input
              id="basic-password"
              autoComplete="new-password"
              type={visible ? "text" : "password"}
              value={value.password ?? ""}
              onChange={(e) => change({ password: e.target.value || undefined })}
            />
          </>
        )}
        {!["none", "custom"].includes(value.authType) && (
          <Button type="button" variant="ghost" onClick={() => setVisible(!visible)}>
            {visible ? "Hide" : "Show"} credentials
          </Button>
        )}
      </div>
      <div className="space-y-3">
        <Label>Request headers</Label>
        <p className="text-xs text-muted-foreground">
          Secret values are encrypted and cannot be read back. Remove a header to delete its saved
          value.
        </p>
        {value.headers.map((h, i) => (
          <div key={i} className="grid gap-2 rounded border p-3">
            <Input
              aria-label={"Header name " + (i + 1)}
              placeholder="X-API-Key"
              value={h.name}
              onChange={(e) =>
                change({
                  headers: value.headers.map((v, j) =>
                    j === i ? { ...v, name: e.target.value, saved: false } : v,
                  ),
                })
              }
            />
            <Input
              aria-label={"Header value " + (i + 1)}
              autoComplete="off"
              type={h.secret ? "password" : "text"}
              placeholder={h.saved ? "Secret saved; blank keeps value" : "Header value"}
              value={h.value ?? ""}
              onChange={(e) =>
                change({
                  headers: value.headers.map((v, j) =>
                    j === i ? { ...v, value: e.target.value || undefined } : v,
                  ),
                })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={h.secret}
                onCheckedChange={(v) =>
                  change({
                    headers: value.headers.map((x, j) => (j === i ? { ...x, secret: v } : x)),
                  })
                }
              />
              Secret
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => change({ headers: value.headers.filter((_, j) => j !== i) })}
            >
              Remove header
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.headers.length >= 20}
          onClick={() =>
            change({
              headers: [
                ...value.headers,
                { name: "", value: "", secret: value.authType === "custom" },
              ],
            })
          }
        >
          Add header
        </Button>
      </div>
      {method !== "GET" && (
        <div className="space-y-2">
          <Label htmlFor="content-type">Body format</Label>
          <Select
            value={value.contentType}
            onValueChange={(v) => change({ contentType: v as HttpConfig["contentType"] })}
          >
            <SelectTrigger id="content-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="application/json">JSON</SelectItem>
              <SelectItem value="text/plain">Plain text</SelectItem>
            </SelectContent>
          </Select>
          <Label htmlFor="request-body">Request body (maximum 8 KB)</Label>
          <textarea
            id="request-body"
            className="w-full min-h-28 rounded border bg-background p-3 font-mono text-sm"
            autoComplete="off"
            value={value.body ?? ""}
            placeholder={value.bodySaved ? "Body saved; leave blank to keep it" : "Request body"}
            onChange={(e) => change({ body: e.target.value })}
          />
          {value.contentType === "application/json" &&
            value.body &&
            (() => {
              try {
                JSON.parse(value.body);
                return null;
              } catch {
                return (
                  <p role="alert" className="text-xs text-destructive">
                    Invalid JSON syntax
                  </p>
                );
              }
            })()}
        </div>
      )}
      {(value.bodySaved || value.body) && (
        <Button
          type="button"
          variant="outline"
          onClick={() => change({ body: null, bodySaved: false })}
        >
          Remove saved body
        </Button>
      )}
      <div className="space-y-2">
        <Label htmlFor="keyword">Response must contain (optional)</Label>
        <Input
          id="keyword"
          maxLength={500}
          value={value.keyword?.text ?? ""}
          onChange={(e) =>
            change({
              keyword: e.target.value
                ? { text: e.target.value, caseSensitive: value.keyword?.caseSensitive ?? true }
                : undefined,
            })
          }
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={value.keyword?.caseSensitive ?? true}
            disabled={!value.keyword}
            onCheckedChange={(v) =>
              value.keyword && change({ keyword: { ...value.keyword, caseSensitive: v } })
            }
          />
          Case sensitive
        </label>
      </div>
      <div className="space-y-3">
        <Label>JSON response assertions</Label>
        <p className="text-xs text-muted-foreground">
          Use dot paths such as data.available. Array indexes are supported; wildcards and
          executable expressions are not.
        </p>
        {value.assertions.map((a, i) => {
          const update = (next: Partial<JsonAssertion>) =>
            change({
              assertions: value.assertions.map((x, j) => (j === i ? { ...x, ...next } : x)),
            });
          return (
            <div key={i} className="space-y-2 rounded border p-3">
              <Input
                aria-label={"Assertion path " + (i + 1)}
                placeholder="data.available"
                value={a.path}
                onChange={(e) => update({ path: e.target.value })}
              />
              <Select
                value={a.operator}
                onValueChange={(v) => update({ operator: v as JsonAssertion["operator"] })}
              >
                <SelectTrigger aria-label={"Assertion operator " + (i + 1)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["exists", "equals", "not_equals", "contains", "greater_than", "less_than"].map(
                    (v) => (
                      <SelectItem key={v} value={v}>
                        {v.replaceAll("_", " ")}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              {a.operator !== "exists" && (
                <AssertionValue value={a.value} onChange={(v) => update({ value: v })} />
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => change({ assertions: value.assertions.filter((_, j) => j !== i) })}
              >
                Remove assertion
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          disabled={value.assertions.length >= 20}
          onClick={() =>
            change({ assertions: [...value.assertions, { path: "", operator: "exists" }] })
          }
        >
          Add assertion
        </Button>
      </div>
    </div>
  );
}
function AssertionValue({
  value,
  onChange,
}: {
  value: JsonAssertion["value"];
  onChange: (v: JsonAssertion["value"]) => void;
}) {
  const type = value === null ? "null" : typeof value === "undefined" ? "string" : typeof value;
  return (
    <div className="space-y-2">
      <Select
        value={type}
        onValueChange={(v) =>
          onChange(v === "number" ? 0 : v === "boolean" ? true : v === "null" ? null : "")
        }
      >
        <SelectTrigger aria-label="Assertion value type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["string", "number", "boolean", "null"].map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {type === "boolean" ? (
        <Select value={String(value)} onValueChange={(v) => onChange(v === "true")}>
          <SelectTrigger aria-label="Boolean value">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        type !== "null" && (
          <Input
            aria-label="Assertion value"
            type={type === "number" ? "number" : "text"}
            value={String(value ?? "")}
            onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
          />
        )
      )}
    </div>
  );
}
