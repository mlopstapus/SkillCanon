import { AlertIcon } from "./field-icons";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-2.5 rounded-control border border-red/35 bg-red-soft px-4 py-3 text-sm font-semibold text-red"
    >
      <AlertIcon className="h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}
