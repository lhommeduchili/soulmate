import { useState, useRef, useEffect, KeyboardEvent, useCallback } from "react";

export interface ProcessKeyOptions {
  key: string;
  isEditing: boolean;
  initialValue: string;
  currentValue: string;
}

export interface ProcessKeyResult {
  action: "startEditing" | "save" | "cancel" | "none";
  nextValue: string;
  shouldPreventDefault: boolean;
}

export function processCellKeyDown({
  key,
  isEditing,
  initialValue,
  currentValue,
}: ProcessKeyOptions): ProcessKeyResult {
  if (!isEditing) {
    if (key === "Enter" || key === " ") {
      return {
        action: "startEditing",
        nextValue: initialValue,
        shouldPreventDefault: true,
      };
    }
    return {
      action: "none",
      nextValue: currentValue,
      shouldPreventDefault: false,
    };
  }

  if (key === "Enter") {
    return {
      action: "save",
      nextValue: currentValue,
      shouldPreventDefault: true,
    };
  }

  if (key === "Escape") {
    return {
      action: "cancel",
      nextValue: initialValue,
      shouldPreventDefault: true,
    };
  }

  return {
    action: "none",
    nextValue: currentValue,
    shouldPreventDefault: false,
  };
}

export function sanitizeCellValue(
  value: string,
  fallbackValue: string,
): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallbackValue;
}

interface Props {
  value: string;
  onChange: (newValue: string) => void;
  className?: string;
  "aria-label"?: string;
}

export function EditableCell({
  value,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: Props): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isCancelledRef = useRef(false);
  const wasEditingRef = useRef(false);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      wasEditingRef.current = true;
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    } else if (wasEditingRef.current) {
      wasEditingRef.current = false;
      // Restore focus to button when exiting edit mode
      requestAnimationFrame(() => {
        buttonRef.current?.focus();
      });
    }
  }, [isEditing]);

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const result = processCellKeyDown({
        key: e.key,
        isEditing: true,
        initialValue: value,
        currentValue: tempValue,
      });

      if (result.shouldPreventDefault) {
        e.preventDefault();
      }

      if (result.action === "save") {
        isCancelledRef.current = false;
        const sanitized = sanitizeCellValue(tempValue, value);
        onChange(sanitized);
        setIsEditing(false);
      } else if (result.action === "cancel") {
        isCancelledRef.current = true;
        setTempValue(value);
        setIsEditing(false);
      }
    },
    [onChange, tempValue, value],
  );

  const handleButtonKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const result = processCellKeyDown({
        key: e.key,
        isEditing: false,
        initialValue: value,
        currentValue: value,
      });

      if (result.shouldPreventDefault) {
        e.preventDefault();
      }

      if (result.action === "startEditing") {
        isCancelledRef.current = false;
        setIsEditing(true);
      }
    },
    [value],
  );

  const handleBlur = useCallback(() => {
    if (isCancelledRef.current) {
      isCancelledRef.current = false;
      return;
    }
    const sanitized = sanitizeCellValue(tempValue, value);
    if (sanitized !== value) {
      onChange(sanitized);
    }
    setIsEditing(false);
  }, [onChange, tempValue, value]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={handleInputKeyDown}
        onBlur={handleBlur}
        aria-label={ariaLabel}
        className={`w-full bg-app-bg text-app-text-main border border-soul-green rounded-none px-2 py-1 outline-none text-xs font-mono font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green ${className}`}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        isCancelledRef.current = false;
        setIsEditing(true);
      }}
      onKeyDown={handleButtonKeyDown}
      aria-label={ariaLabel}
      className={`w-full text-left cursor-text hover:bg-app-surface hover:ring-1 hover:ring-app-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded-none px-2 py-1 -mx-2 transition-colors truncate ${className}`}
      title={ariaLabel}
    >
      {value}
    </button>
  );
}
