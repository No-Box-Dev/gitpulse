import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export interface AdminSectionDef {
  id: string;
  label: string;
}

// Tracks the Admin page section currently in view via IntersectionObserver;
// the entry straddling the viewport's upper-middle band is the section the
// reader is "in".
function useActiveSection(sections: AdminSectionDef[]) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { root: null, rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return activeId;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Desktop: sticky vertical nav in the Admin page's left column.
export function AdminSectionNavDesktop({ sections }: { sections: AdminSectionDef[] }) {
  const activeId = useActiveSection(sections);
  return (
    <nav className="hidden lg:block w-44 shrink-0" aria-label="Admin sections">
      <div className="sticky top-24 space-y-1">
        {sections.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => scrollToSection(id)}
            className={cn(
              "block w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer",
              activeId === id
                ? "bg-accent/10 text-accent font-medium"
                : "text-stone-500 hover:text-stone-800 hover:bg-stone-100",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// Mobile: horizontal chip row rendered above the sections.
export function AdminSectionNavMobile({ sections }: { sections: AdminSectionDef[] }) {
  const activeId = useActiveSection(sections);
  return (
    <nav className="lg:hidden flex items-center gap-1 overflow-x-auto pb-1" aria-label="Admin sections">
      {sections.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => scrollToSection(id)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer",
            activeId === id
              ? "bg-accent/10 text-accent"
              : "text-stone-500 hover:bg-stone-50",
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
