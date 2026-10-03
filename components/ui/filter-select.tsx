'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type FilterSelectOption = Readonly<{ value: string; label: string }>

type FilterSelectProps = Readonly<{
  id: string
  name?: string
  options: readonly FilterSelectOption[]
  value?: string
  defaultValue?: string
  disabled?: boolean
  onValueChange?: (value: string) => void
}>

/** Preserve empty GET-filter values while Radix requires nonempty option values. */
export function FilterSelect({ id, name, options, value, defaultValue = '', disabled, onValueChange }: FilterSelectProps) {
  const [localValue, setLocalValue] = useState(defaultValue)
  const selectedValue = value ?? localValue
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label
  const handleChange = (encodedValue: string) => {
    const nextValue = encodedValue.slice('option:'.length)
    if (value === undefined) setLocalValue(nextValue)
    onValueChange?.(nextValue)
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={selectedValue} disabled={disabled} />}
      <Select value={`option:${selectedValue}`} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger id={id} className="h-9 w-full">
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" className="max-w-[calc(100vw-2rem)]">
          {options.map((option) => (
            <SelectItem key={option.value} value={`option:${option.value}`} className="min-h-9 break-words">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
