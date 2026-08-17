import type { DistributionStatus } from "@mimicast/shared";

import { Button } from "../../../components/Button.tsx";

interface DistributionToggleProps {
  value: DistributionStatus;
  pending?: boolean;
  onChange: (next: DistributionStatus) => void;
}

export function DistributionToggle({
  value,
  pending = false,
  onChange,
}: DistributionToggleProps) {
  return (
    <div className="toggle" role="group" aria-label="配信許可">
      <Button
        variant={value === "DISABLED" ? "primary" : "ghost"}
        aria-pressed={value === "DISABLED"}
        disabled={pending}
        onClick={() => onChange("DISABLED")}
      >
        OFF
      </Button>
      <Button
        variant={value === "ENABLED" ? "primary" : "ghost"}
        aria-pressed={value === "ENABLED"}
        disabled={pending}
        onClick={() => onChange("ENABLED")}
      >
        ON
      </Button>
    </div>
  );
}
