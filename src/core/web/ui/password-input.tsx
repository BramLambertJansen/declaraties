import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ComponentProps } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { cn } from './cn.ts';
import { Input } from './input.tsx';

export type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  readonly visibilityLabel?: string;
};

export function PasswordInput({
  id,
  disabled,
  className,
  visibilityLabel = uiTexts.visibilityToggle,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        {...props}
        id={inputId}
        disabled={disabled}
        className={cn('h-control min-w-0 flex-1', className)}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <Button
        type="button"
        variant={visible ? 'secondary' : 'outline'}
        size="icon"
        className="h-control shrink-0"
        disabled={disabled}
        title={visibilityLabel}
        aria-pressed={visible}
        aria-controls={inputId}
        onClick={() => {
          setVisible((current) => !current);
        }}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        <span className="sr-only">{visibilityLabel}</span>
      </Button>
    </div>
  );
}
