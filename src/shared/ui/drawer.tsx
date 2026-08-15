"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getVisibleFocusableElements(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.closest(".hidden") &&
      !element.closest("[hidden]") &&
      !element.closest('[aria-hidden="true"]'),
  );
}

export interface DrawerProps {
  onClose: () => void;
  /** id of the element (rendered by the caller, inside `children`) that names this drawer for assistive tech. */
  labelledBy: string;
  /** Tailwind width class for the panel, e.g. "w-[452px]". Defaults to the most common drawer width in this app. */
  widthClassName?: string;
  children: ReactNode;
}

/**
 * Shared slide-in panel primitive for every drawer in the app. Renders the
 * same backdrop + right-anchored panel markup every feature drawer already
 * used ad hoc, but adds the accessibility semantics none of them had:
 * role="dialog"/aria-modal so assistive tech announces it as a dialog,
 * Escape-to-close, a Tab focus trap scoped to the panel, and focus
 * returning to whatever triggered the drawer on close. Header/body/footer
 * markup stays owned by each caller (passed as `children`) since drawers
 * vary too much (compound titles, custom footers) for one fixed layout.
 */
export function Drawer({ onClose, labelledBy, widthClassName = "w-[452px]", children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;
    const initialFocusTarget = panel ? getVisibleFocusableElements(panel)[0] : undefined;
    (initialFocusTarget ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) {
        return;
      }
      const focusable = getVisibleFocusableElements(panel);
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100]">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex ${widthClassName} max-w-[92vw] flex-col border-l border-border-2 bg-panel shadow-drawer outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
