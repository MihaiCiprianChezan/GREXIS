import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";

export function Layout() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "#1a1a2e",
        color: "#e0e0e0",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          padding: "24px",
          overflow: "auto",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
