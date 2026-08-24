import { Switch as HeadlessSwitch } from '@headlessui/react';
import { forwardRef } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  id?: string;
  disabled?: boolean;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>((props, ref) => (
  <HeadlessSwitch
    ref={ref}
    {...props}
    className="group relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-gray-700 transition-colors focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-gray-900 focus:outline-none data-[checked]:bg-accent-600 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
  >
    <span className="inline-block h-4 w-4 translate-x-0.5 transform rounded-full bg-gray-300 shadow transition group-data-[checked]:translate-x-4 group-data-[checked]:bg-white" />
  </HeadlessSwitch>
));

Switch.displayName = 'Switch';
