"use client";

import { useState } from "react";

export function AutoSubmitNumberInput({
  className,
  defaultValue,
  min,
  name,
  placeholder,
  step
}: {
  className?: string;
  defaultValue: number | string;
  min?: string;
  name: string;
  placeholder?: string;
  step?: string;
}) {
  const initialValue = String(defaultValue ?? "");
  const [value, setValue] = useState(initialValue);
  const [lastSubmittedValue, setLastSubmittedValue] = useState(initialValue);

  function commit(input: HTMLInputElement) {
    const nextValue = input.value.trim() === "" ? "0" : input.value.trim();

    if (nextValue === lastSubmittedValue) {
      if (input.value !== nextValue) {
        setValue(nextValue);
      }

      return;
    }

    setValue(nextValue);
    setLastSubmittedValue(nextValue);
    window.setTimeout(() => input.form?.requestSubmit(), 0);
  }

  return (
    <input
      className={className}
      min={min}
      name={name}
      onBlur={(event) => commit(event.currentTarget)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget);
        }
      }}
      placeholder={placeholder}
      step={step}
      type="number"
      value={value}
    />
  );
}
