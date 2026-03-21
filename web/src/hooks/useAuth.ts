import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export function useAuth() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check session directly without the 401-redirect wrapper
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => setAuthenticated(res.ok))
      .catch(() => setAuthenticated(false));
  }, []);

  return { authenticated, setAuthenticated };
}
