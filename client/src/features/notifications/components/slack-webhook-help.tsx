import { CircleHelp, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const steps = [
  {
    title: "Create a Slack app",
    body: "Open api.slack.com/apps, choose Create New App, then From scratch. Name it (for example FaultLine Alerts) and pick your workspace.",
  },
  {
    title: "Turn on Incoming Webhooks",
    body: "In the app's left menu open Incoming Webhooks and switch Activate Incoming Webhooks to On.",
  },
  {
    title: "Add it to a channel",
    body: "Click Add New Webhook to Workspace, choose the channel that should receive alerts, then click Allow.",
  },
  {
    title: "Copy the Webhook URL",
    body: "Copy the URL that starts with https://hooks.slack.com/services/ and paste it into FaultLine.",
  },
];

export function SlackWebhookHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="How to get a Slack webhook URL"
          className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[80vh] w-[min(24rem,calc(100vw-2rem))] space-y-4 overflow-y-auto text-sm"
      >
        <div className="space-y-1">
          <p className="font-semibold">How to get a Slack webhook URL</p>
          <p className="text-muted-foreground">
            You need permission to add apps to your Slack workspace. It takes about two minutes.
          </p>
        </div>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">
                {index + 1}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{step.title}</p>
                <p className="text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-md bg-muted p-3 text-muted-foreground">
          Treat the URL like a password: anyone with it can post to that channel. FaultLine stores
          it encrypted and never shows it again. After saving, use Send test notification to confirm
          it works.
        </p>
        <a
          href="https://api.slack.com/messaging/webhooks"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
        >
          Slack's official guide <ExternalLink className="size-3.5" />
        </a>
      </PopoverContent>
    </Popover>
  );
}
