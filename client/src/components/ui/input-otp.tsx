import * as React from "react";
import { OTPInput, type SlotProps } from "input-otp";
import { Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type InputOTPProps = Omit<
  React.ComponentPropsWithoutRef<typeof OTPInput>,
  "render" | "children"
>;

const InputOTP = React.forwardRef<React.ElementRef<typeof OTPInput>, InputOTPProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <OTPInput
      ref={ref}
      containerClassName={cn("flex items-center gap-2", containerClassName)}
      className={cn("disabled:cursor-not-allowed", className)}
      render={({ slots }) => (
        <div className="flex items-center gap-2">
          {slots.map((slot, index) => (
            <React.Fragment key={index}>
              <InputOTPSlot {...slot} />
              {index === 2 && <InputOTPSeparator />}
            </React.Fragment>
          ))}
        </div>
      )}
      {...props}
    />
  ),
);
InputOTP.displayName = "InputOTP";

const InputOTPSlot = ({ char, hasFakeCaret, isActive }: SlotProps) => (
  <div
    className={cn(
      "relative flex size-11 items-center justify-center rounded-md border border-input bg-background text-sm font-medium transition",
      isActive && "z-10 border-ring ring-2 ring-ring/20",
    )}
  >
    {char}
    {hasFakeCaret && (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-5 w-px animate-pulse bg-foreground" />
      </div>
    )}
  </div>
);

const InputOTPSeparator = () => (
  <div role="separator" className="text-muted-foreground">
    <Minus className="size-3" />
  </div>
);

export { InputOTP, InputOTPSlot, InputOTPSeparator };
