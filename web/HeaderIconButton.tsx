import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

interface HeaderIconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  label: string;
  tooltip?: string;
  children: ReactNode;
}

/**
 * A compact header action whose accessible name and explicit tooltip stay
 * available when its visible label is intentionally omitted.
 */
export function HeaderIconButton({
  label,
  tooltip = label,
  children,
  className = "",
  "aria-describedby": describedBy,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...buttonProps
}: HeaderIconButtonProps) {
  const tooltipId = useId();
  const [isPointerOver, setIsPointerOver] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isVisible = isPointerOver || isFocused;

  return (
    <span className="header-icon-control">
      <button
        {...buttonProps}
        type={buttonProps.type ?? "button"}
        className={`header-icon-button ${className}`.trim()}
        aria-label={label}
        aria-describedby={[describedBy, tooltipId].filter(Boolean).join(" ")}
        onPointerEnter={(event) => {
          setIsPointerOver(true);
          onPointerEnter?.(event);
        }}
        onPointerLeave={(event) => {
          setIsPointerOver(false);
          onPointerLeave?.(event);
        }}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
      >
        {children}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`header-icon-tooltip ${isVisible ? "is-visible" : ""}`}
      >
        {tooltip}
      </span>
    </span>
  );
}
