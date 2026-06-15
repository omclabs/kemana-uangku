type IconProps = {
  className?: string;
};

function Icon({ className = 'h-5 w-5', d }: IconProps & { d: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return <Icon {...props} d="M12 4.5v15m7.5-7.5h-15" />;
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props} d="M4.5 12.75l6 6 9-13.5" />;
}

export function XMarkIcon(props: IconProps) {
  return <Icon {...props} d="M6 18L18 6M6 6l12 12" />;
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
    />
  );
}

export function ArrowRightOnRectangleIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H3"
    />
  );
}

export function ChevronRightIcon(props: IconProps) {
  return <Icon {...props} d="m8.25 4.5 7.5 7.5-7.5 7.5" />;
}

export function LockClosedIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z"
    />
  );
}
