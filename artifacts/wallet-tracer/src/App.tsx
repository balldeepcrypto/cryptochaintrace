import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { DashboardGate } from "@/components/dashboard-gate";

// Pages
import Home from "@/pages/home";
import WalletDetail from "@/pages/wallet-detail";
import TraceGraph from "@/pages/trace-graph";
import ReportView from "@/pages/report-view";
import SubmitCase from "@/pages/submit";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Standalone public pages — no chrome, no auth */}
      <Route path="/report-view" component={ReportView} />
      <Route path="/submit">
        <SubmitCase />
      </Route>

      {/* Root — public intake form */}
      <Route path="/">
        <SubmitCase />
      </Route>

      {/* Protected dashboard — requires password */}
      <Route>
        <DashboardGate>
          <Layout>
            <Switch>
              <Route path="/dashboard" component={Home} />
              <Route path="/wallet/:address" component={WalletDetail} />
              <Route path="/trace/:address" component={TraceGraph} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </DashboardGate>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
