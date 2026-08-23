import * as Slider from '@radix-ui/react-slider'
import * as Switch from '@radix-ui/react-switch'
import type { ReactNode } from 'react'

interface NumberFieldProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  hint?: string
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
  hint,
}: NumberFieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__control">
        <input
          type="number"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))
          }
        />
        {suffix ? <span className="field__suffix">{suffix}</span> : null}
      </span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  )
}

interface SliderFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: SliderFieldProps) {
  return (
    <div className="slider-field">
      <div className="slider-field__header">
        <span>{label}</span>
        <output>{value}{suffix}</output>
      </div>
      <Slider.Root
        className="slider"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
      >
        <Slider.Track className="slider__track">
          <Slider.Range className="slider__range" />
        </Slider.Track>
        <Slider.Thumb className="slider__thumb" aria-label={label} />
      </Slider.Root>
    </div>
  )
}

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children?: ReactNode
}

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  children,
}: ToggleRowProps) {
  return (
    <div className={`toggle-row${checked ? ' toggle-row--active' : ''}`}>
      <div className="toggle-row__head">
        <div>
          <div className="toggle-row__label">{label}</div>
          <div className="toggle-row__description">{description}</div>
        </div>
        <Switch.Root
          className="switch"
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-label={`Toggle ${label}`}
        >
          <Switch.Thumb className="switch__thumb" />
        </Switch.Root>
      </div>
      {checked && children ? <div className="toggle-row__body">{children}</div> : null}
    </div>
  )
}

interface SegmentOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="segmented-field">
      <span className="field__label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'segmented__button segmented__button--active' : 'segmented__button'}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ConfigGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="config-group">
      <h2>{title}</h2>
      {children}
    </section>
  )
}