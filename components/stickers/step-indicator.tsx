type StepIndicatorProps = {
  steps: { key: string; label: string }[];
  current: number; // 0-based index of the active step
};

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center gap-0">
        {steps.map((step, i) => {
          const isActive = i === current;
          const isDone = i < current;

          return (
            <li
              key={step.key}
              className="flex flex-1 flex-col items-center gap-1"
              aria-current={isActive ? "step" : undefined}
            >
              {/* Connector line before (not for first item) */}
              <div className="flex w-full items-center">
                {/* Left line */}
                <div
                  className={[
                    "h-px flex-1",
                    i === 0 ? "invisible" : isDone || isActive ? "bg-accent" : "bg-line",
                  ].join(" ")}
                  aria-hidden="true"
                />
                {/* Circle */}
                <span
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                    isActive
                      ? "border-accent bg-accent text-paper"
                      : isDone
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line bg-paper text-muted",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                {/* Right line */}
                <div
                  className={[
                    "h-px flex-1",
                    i === steps.length - 1 ? "invisible" : isDone ? "bg-accent" : "bg-line",
                  ].join(" ")}
                  aria-hidden="true"
                />
              </div>

              {/* Label */}
              <span
                className={[
                  "text-xs font-medium",
                  isActive ? "text-accent" : isDone ? "text-accent/80" : "text-muted",
                ].join(" ")}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
