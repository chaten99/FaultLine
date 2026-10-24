import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = React.InputHTMLAttributes<HTMLInputElement>;
export function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 pr-10 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible(!visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{visible ? "Hide password" : "Show password"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
