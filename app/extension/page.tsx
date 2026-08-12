import { ExtensionSettings } from "../components/extension/ExtensionSettings";
import { PageHeader } from "../components/ui";

export default function ExtensionPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Chrome extension"
        subtitle="Install the autofill extension, check its connection, and review optional AI-assisted filling."
      />
      <ExtensionSettings />
    </div>
  );
}
