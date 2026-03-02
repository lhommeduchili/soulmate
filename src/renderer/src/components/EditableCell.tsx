
import { useState, useRef, useEffect, KeyboardEvent } from 'react'

interface Props {
    value: string
    onChange: (newValue: string) => void
    className?: string
}

export function EditableCell({ value, onChange, className = '' }: Props): JSX.Element {
    const [isEditing, setIsEditing] = useState(false)
    const [tempValue, setTempValue] = useState(value)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setTempValue(value)
    }, [value])

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            onChange(tempValue)
            setIsEditing(false)
        } else if (e.key === 'Escape') {
            setTempValue(value)
            setIsEditing(false)
        }
    }

    const handleBlur = () => {
        onChange(tempValue)
        setIsEditing(false)
    }

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
        )
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={`cursor-text hover:bg-app-activity/30 hover:ring-1 hover:ring-app-border rounded px-2 py-1 -mx-2 transition-all truncate ${className}`}
            title="Click to edit"
        >
            {value}
        </div>
    )
}
