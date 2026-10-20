import { useId, useState, type ComponentProps } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { Input } from './input.tsx';

export type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  readonly visibilityLabel?: string;
};

export function PasswordInput({
  id,
  disabled,
  visibilityLabel = uiTexts.visibilityToggle,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Input
        {...props}
        id={inputId}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <Button
        type="button"
        variant={visible ? 'secondary' : 'outline'}
        className="self-start"
        disabled={disabled}
        aria-pressed={visible}
        aria-controls={inputId}
        onClick={() => {
          setVisible((current) => !current);
        }}
      >
        {visibilityLabel}
      </Button>
    </div>
  );
}
