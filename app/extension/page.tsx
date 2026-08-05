import { ExtensionSettings } from "../components/extension/ExtensionSettings";
import { PageHeader } from "../components/ui";

export default function ExtensionPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Chrome extension"
        subtitle="Install the autofill extension and check its live connection to this dashboard."
      />
      <ExtensionSettings />
    </div>
  );
}
