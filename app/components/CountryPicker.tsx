"use client";

import { useId, useState } from "react";
import { COUNTRIES, getCountryLabel } from "@/lib/profile";

type CountryPickerProps = {
  error?: string;
  id?: string;
  onBlur?: () => void;
  onChange: (countryCode: string) => void;
  value: string;
};

export default function CountryPicker({ error, id = "country", onBlur, onChange, value }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const selectedLabel = getCountryLabel(value);

  function closePicker() {
    setOpen(false);
    onBlur?.();
  }

  function selectCountry(countryCode: string) {
    onChange(countryCode);
    closePicker();
  }

  return (
    <div className="countryPicker">
      <button
        id={id}
        type="button"
        className={`countryPickerButton${error ? " invalid" : ""}`}
        onClick={() => setOpen(true)}
        aria-describedby={error ? "country-error" : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby="country-label"
        aria-invalid={Boolean(error)}
      >
        <span className={selectedLabel ? "countryPickerValue" : "countryPickerPlaceholder"}>
          {selectedLabel || "Select country"}
        </span>
        <span aria-hidden="true" className="countryPickerChevron">▾</span>
      </button>

      {open && (
        <div className="countryPickerOverlay" role="presentation" onClick={closePicker}>
          <div
            className="countryPickerSheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="countryPickerHeader">
              <div>
                <p className="eyebrow">Controlled selection</p>
                <h3 id={titleId}>Select country</h3>
              </div>
              <button type="button" className="secondary smallButton" onClick={closePicker}>
                Close
              </button>
            </div>
            <div className="countryPickerList">
              {COUNTRIES.map((country) => {
                const selected = country.code === value;
                return (
                  <button
                    key={country.code}
                    type="button"
                    className={`countryPickerOption${selected ? " selected" : ""}`}
                    onClick={() => selectCountry(country.code)}
                    aria-pressed={selected}
                  >
                    <span>{country.label}</span>
                    {selected && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
