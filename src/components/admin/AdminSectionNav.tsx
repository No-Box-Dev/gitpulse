import { cn } from "@/lib/cn";

export interface AdminServiceDef {
  id: string;
  label: string;
}

export function AdminServiceNav({
  sections,
  activeId,
  onChange,
}: {
  sections: AdminServiceDef[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Admin services"
      className="flex items-center gap-1 overflow-x-auto border-b border-stone-200"
    >
      {sections.map(({ id, label }) => {
        const active = activeId === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(id)}
            className={cn(
              "relative shrink-0 cursor-pointer px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-stone-900" : "text-stone-500 hover:text-stone-800",
            )}
          >
            {label}
            {active ? <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded-full bg-accent" /> : null}
          </button>
        );
      })}
    </nav>
  );
}
