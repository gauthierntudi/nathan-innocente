"use client";

import type { AdminCeremony, CeremonyId } from "@/lib/admin/ceremony-types";

export function collectGroupNames(
  ceremonies: AdminCeremony[],
  ceremonyIds: CeremonyId[],
) {
  const pool =
    ceremonyIds.length > 0
      ? ceremonies.filter((ceremony) => ceremonyIds.includes(ceremony.id))
      : ceremonies;
  const names = new Set<string>();

  for (const ceremony of pool) {
    for (const group of ceremony.groups ?? []) {
      const name = group.name?.trim();
      if (name) names.add(name);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, "fr"));
}

type GroupNameFieldProps = {
  label: string;
  value: string;
  existingGroups: string[];
  disabled?: boolean;
  hint?: string;
  onChange: (value: string) => void;
};

export function GroupNameField({
  label,
  value,
  existingGroups,
  disabled,
  hint,
  onChange,
}: GroupNameFieldProps) {
  const selectKey = existingGroups.join("\0");

  return (
    <label className="admin-modal__field">
      <span>{label}</span>
      {existingGroups.length > 0 ? (
        <select
          key={selectKey}
          className="admin-select"
          defaultValue=""
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">Choisir un groupe existant…</option>
          {existingGroups.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : null}
      <input
        type="text"
        className="admin-field"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex: Famille, VIP, Amis"
      />
      {hint ? <small className="admin-modal__hint">{hint}</small> : null}
    </label>
  );
}
