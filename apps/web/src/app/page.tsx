import { Sidebar } from "@/components/sidebar";

export default function Home() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Select a project to get started
        </p>
      </main>
    </div>
  );
}
