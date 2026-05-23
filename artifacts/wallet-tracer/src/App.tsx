import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

// Pages
import Home from "@/pages/home";
import WalletDetail from "@/pages/wallet-detail";
import TraceGraph from "@/pages/trace-graph";
import ReportView from "@/pages/report-view";
import SubmitCase from "@/pages/submit";
import Login from "@/pages/login";
import ManageAnalysts from "@/pages/manage-analysts";
import AnalystActivity from "@/pages/analyst-activity";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0f1e",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "ui-monospace, monospace", color: "#22d3ee", fontSize: "0.8rem",
        letterSpacing: "0.15em",
      }}>
        INITIALIZING…
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}

function LoginGate() {
  const { session, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && session) navigate("/dashboard");
  }, [loading, session, navigate]);

  if (loading || session) return null;
  return <Login />;
}

function Router() {
  return (
    <Switch>
      {/* Public pages — no auth required */}
      <Route path="/report-view" component={ReportView} />
      <Route path="/submit">
        <SubmitCase />
      </Route>
      <Route path="/">
        <SubmitCase />
      </Route>
      <Route path="/login">
        <LoginGate />
      </Route>

      {/* Protected pages */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <Layout>
            <Home />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/wallet/:address">
        {(_params) => (
          <ProtectedRoute>
            <Layout>
              <WalletDetail />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/trace/:address">
        {(_params) => (
          <ProtectedRoute>
            <Layout>
              <TraceGraph />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/manage-analysts">
        <ProtectedRoute>
          <Layout>
            <ManageAnalysts />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/analyst-activity">
        <ProtectedRoute>
          <Layout>
            <AnalystActivity />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
