import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import NotFound from "@/pages/not-found";
import Layout from "./components/layout";
import Dashboard from "./pages/dashboard";
import ScorePage from "./pages/score";
import Wallet from "./pages/wallet";
import Partners from "./pages/partners";
import Offers from "./pages/offers";
import Calculator from "./pages/calculator";
import Admin from "./pages/admin";
import PassportPage from "./pages/passport";
import AuthPage, { getStoredToken } from "./pages/auth";
import ProfilePage from "./pages/profile";
import { OfferDetail, PartnerDetail } from "./pages/catalog-detail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 2 * 60 * 1000 },
  },
});

// Initialise auth token getter from localStorage on every load
const stored = getStoredToken();
if (stored) setAuthTokenGetter(() => getStoredToken());

function ProtectedRouter() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    setAuthed(!!token);
    const handler = () => {
      queryClient.clear();
      setAuthed(!!getStoredToken());
    };
    window.addEventListener("storage", handler);
    window.addEventListener("ls-auth-change", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("ls-auth-change", handler);
    };
  }, []);

  if (authed === null) {
    // Loading state — brief
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded border-2 border-border border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Public standalone pages — no auth gate, no Layout */}
      <Route path="/passport" component={PassportPage} />
      <Route path="/passport/:token" component={PassportPage} />
      <Route path="/auth">
        {authed ? <Redirect to="/" /> : <AuthPage />}
      </Route>

      {/* Protected pages — require auth */}
      <Route>
        {!authed ? (
          <Redirect to="/auth" />
        ) : (
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/score" component={ScorePage} />
              <Route path="/wallet" component={Wallet} />
              <Route path="/partners/:id" component={PartnerDetail} />
              <Route path="/partners" component={Partners} />
              <Route path="/offers/:id" component={OfferDetail} />
              <Route path="/offers" component={Offers} />
              <Route path="/calculator" component={Calculator} />
              <Route path="/admin" component={Admin} />
              <Route path="/profile" component={ProfilePage} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ProtectedRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
