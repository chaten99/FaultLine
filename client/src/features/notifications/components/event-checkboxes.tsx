import { Checkbox } from "@/components/ui/checkbox";
import { eventLabels, incidentEventTypes, toggleEvent } from "../lib/notification-presentation";
import type { IncidentEventType } from "../types/notification.types";

interface EventCheckboxesProps {
  idPrefix: string;
  value: IncidentEventType[];
  onChange: (value: IncidentEventType[]) => void;
  disabled?: boolean;
}

export function EventCheckboxes({ idPrefix, value, onChange, disabled }: EventCheckboxesProps) {
  return (
    <div className="space-y-2" role="group" aria-label="Event subscriptions">
      {incidentEventTypes.map((event) => {
        const id = `${idPrefix}-${event}`;
        return (
          <div key={event} className="flex items-center gap-2.5">
            <Checkbox
              id={id}
              checked={value.includes(event)}
              disabled={disabled}
              onCheckedChange={(checked) => onChange(toggleEvent(value, event, checked))}
            />
            <label htmlFor={id} className="text-sm">
              {eventLabels[event]}
            </label>
          </div>
        );
      })}
    </div>
  );
}
