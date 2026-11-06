import { KeyRound, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { eventLabels, formatRelativeTime, summarizeEvents } from "../lib/notification-presentation";
import type { Integration } from "../types/notification.types";
import { DeliveryStatusBadge } from "./delivery-status-badge";

interface IntegrationRowProps {
  integration: Integration;
  toggling: boolean;
  testing: boolean;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
  onReplaceUrl: () => void;
  onRotateSecret: () => void;
  onDelete: () => void;
}

export function IntegrationRow({
  integration,
  toggling,
  testing,
  onToggle,
  onTest,
  onEdit,
  onReplaceUrl,
  onRotateSecret,
  onDelete,
}: IntegrationRowProps) {
  const last = integration.lastDelivery;
  const isWebhook = integration.type === "webhook";

  return (
    <li className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium break-words">{integration.name}</p>
          <p className="font-mono text-xs break-all text-muted-foreground">{integration.urlHint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {toggling ? <SpinnerCustom /> : null}
          <Switch
            aria-label={`${integration.enabled ? "Disable" : "Enable"} ${integration.name}`}
            checked={integration.enabled}
            disabled={toggling}
            onCheckedChange={onToggle}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{integration.enabled ? "Enabled" : "Disabled"}</span>
        <span title={integration.events.map((event) => eventLabels[event]).join(", ")}>
          Events: {summarizeEvents(integration.events)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          Last delivery:{" "}
          {last ? (
            <>
              <DeliveryStatusBadge status={last.status} />
              <span>{formatRelativeTime(last.at)}</span>
            </>
          ) : (
            "none yet"
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={testing} onClick={onTest}>
          {testing ? <SpinnerCustom>Sending test…</SpinnerCustom> : "Send test notification"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More actions for ${integration.name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" /> Edit name and events
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onReplaceUrl}>
              <RefreshCw className="size-4" />{" "}
              {isWebhook ? "Replace endpoint URL" : "Replace webhook URL"}
            </DropdownMenuItem>
            {isWebhook ? (
              <DropdownMenuItem onSelect={onRotateSecret}>
                <KeyRound className="size-4" /> Rotate signing secret
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
