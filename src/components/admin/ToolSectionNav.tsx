export interface ToolSection {
  id: string;
  label: string;
}

export function ToolSectionNav({
  label,
  sections,
  activeId,
  onChange,
}: {
  label: string;
  sections: readonly ToolSection[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav role="tablist" aria-label={label} className="grid gap-1 rounded-xl bg-stone-100 p-1" style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}>
      {sections.map((section) => {
        const active = section.id === activeId;
        return (
          <button
            key={section.id}
            id={`${section.id}-tab`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${section.id}-panel`}
            onClick={() => onChange(section.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}
