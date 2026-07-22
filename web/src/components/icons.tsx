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

export function XMarkIcon(props: IconProps) {
  return <Icon {...props} d="M6 18L18 6M6 6l12 12" />;
}

export function ChevronLeftIcon(props: IconProps) {
  return <Icon {...props} d="M15.75 19.5 8.25 12l7.5-7.5" />;
}
