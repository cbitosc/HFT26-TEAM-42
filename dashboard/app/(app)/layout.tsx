import "@/app/styles/entrance.css";
import { Dock } from "@/components/Dock";
import { StatusStrip } from "@/components/StatusStrip";
import { Toasts } from "@/components/Toasts";
import { RunsProvider } from "@/lib/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RunsProvider>
      <div className="app field">
        <Dock />
        <StatusStrip />
        <main className="page">{children}</main>
        <Toasts />
      </div>
    </RunsProvider>
  );
}
