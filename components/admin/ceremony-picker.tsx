"use client";

import { CEREMONY_DEFINITIONS, type CeremonyId } from "@/lib/admin/ceremony-types";

type CeremonyPickerProps = {
  value: CeremonyId[];
  disabled?: boolean;
  label?: string;
  onChange: (next: CeremonyId[]) => void;
};

export function CeremonyPicker({
  value,
  disabled = false,
  label = "Cérémonies",
  onChange,
}: CeremonyPickerProps) {
  function toggle(ceremonyId: CeremonyId, checked: boolean) {
    if (checked) {
      onChange([...new Set([...value, ceremonyId])]);
      return;
    }
    onChange(value.filter((id) => id !== ceremonyId));
  }

  return (
    <fieldset className="admin-ceremony-picker">
      <legend>{label}</legend>
      <div className="admin-ceremony-picker__list">
        {CEREMONY_DEFINITIONS.map((ceremony) => (
          <label key={ceremony.id} className="admin-ceremony-picker__item">
            <input
              type="checkbox"
              checked={value.includes(ceremony.id)}
              disabled={disabled}
              onChange={(e) => toggle(ceremony.id, e.target.checked)}
            />
            <span>{ceremony.name}</span>
          </label>
        ))}
      </div>
      <p className="admin-ceremony-picker__hint">
        Optionnel — l&apos;invité pourra aussi être affecté plus tard dans l&apos;onglet
        Cérémonies.
      </p>
    </fieldset>
  );
}
