import { type ButtonHTMLAttributes, type ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CloseIcon } from "./icons";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-amber text-ink hover:bg-[#e7b455] active:bg-[#c99639] border border-transparent",
  outline:
    "border border-ink-line bg-transparent text-paper hover:border-paper-muted/60 hover:bg-ink-raised",
  ghost: "border border-transparent text-paper-muted hover:bg-ink-raised hover:text-paper",
  danger: "border border-coral/40 bg-transparent text-coral hover:bg-coral/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export interface SandboxButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
}

export function SandboxButton({
  variant = "outline",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: SandboxButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm font-medium tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-3.5 animate-spin rounded-full border border-current border-t-transparent",
        className,
      )}
    />
  );
}

export const inputClass =
  "w-full rounded-sm border border-ink-line bg-ink px-3 py-2 text-sm text-paper placeholder:text-paper-muted/50 outline-none transition-colors focus:border-amber/70 focus-visible:ring-1 focus-visible:ring-amber/40";

export const selectClass = `${inputClass} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23a9a396%22 stroke-width=%221.6%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_0.75rem_center] bg-no-repeat pr-8`;

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("block space-y-1.5", className)}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-paper-muted">
          {label}
        </span>
        {hint ? <span className="text-[11px] text-paper-muted/70">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

export function ErrorBanner({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 border border-coral/35 bg-coral/8 px-3 py-2 text-xs leading-relaxed text-coral"
    >
      <span>{message}</span>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭错误提示"
          className="mt-0.5 shrink-0 text-coral/70 hover:text-coral"
        >
          <CloseIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭对话框"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative max-h-[88dvh] w-full overflow-y-auto rounded-sm border border-ink-line bg-ink-raised p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] sm:p-6",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl tracking-tight text-paper">{title}</h2>
            {description ? (
              <p className="text-xs leading-relaxed text-paper-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="mt-0.5 text-paper-muted transition-colors hover:text-paper"
          >
            <CloseIcon size={18} />
          </button>
        </header>
        <div className="space-y-4">{children}</div>
        {footer ? (
          <footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-ink-line pt-4">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-hidden="true">
      <span className="typing-dot" />
      <span className="typing-dot [animation-delay:160ms]" />
      <span className="typing-dot [animation-delay:320ms]" />
    </span>
  );
}

export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "amber" | "teal" | "coral";
}) {
  const tones = {
    muted: "border-ink-line text-paper-muted",
    amber: "border-amber/40 text-amber",
    teal: "border-teal/40 text-teal",
    coral: "border-coral/40 text-coral",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] leading-none tracking-wider",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
