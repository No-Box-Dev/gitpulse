import type { IntegrationsStatus } from "@/lib/integrations-api";

export interface OptionalServiceAdminPageProps {
  enabled: boolean;
  isAdmin: boolean;
  settingsReady: boolean;
  isSaving: boolean;
  hasError: boolean;
  status: IntegrationsStatus | undefined;
  loading: React.ReactNode;
  onToggle: (enabled: boolean) => void;
}
