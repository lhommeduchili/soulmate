import { useState, useRef, useEffect, KeyboardEvent } from "react";

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

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onChange(tempValue);
      setIsEditing(false);
    } else if (e.key === "Escape") {
      setTempValue(value);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`w-full bg-app-bg text-app-text-main border border-soul-green/50 rounded px-2 py-1 outline-none text-sm font-medium ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setIsEditing(true);
        }
      }}
      aria-label={ariaLabel}
      className={`w-full text-left cursor-text hover:bg-app-activity/30 hover:ring-1 hover:ring-app-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soul-green rounded px-2 py-1 -mx-2 transition-all truncate ${className}`}
      title={ariaLabel}
    >
      {value}
    </button>
  );
}
