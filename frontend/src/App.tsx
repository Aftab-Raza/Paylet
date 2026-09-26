import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState("Connecting to backend...");

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Backend request failed");
        }

        const data = await response.json();
        setStatus(data.message);
      } catch {
        if (!controller.signal.aborted) {
          setStatus("Cannot connect. Check that the backend is running.");
        }
      }
    }

    void checkBackend();

    return () => controller.abort();
  }, []);

  return (
    <main className="welcome">
      <span className="badge">Local development</span>
      <h1>Paylet</h1>
      <p>Personal expenses, shared bills, and lending in one place.</p>

      <section className="status-card" aria-live="polite">
        <h2>Connection status</h2>
        <p>{status}</p>
      </section>
    </main>
  );
}

export default App;