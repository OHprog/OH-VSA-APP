import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Suppliers from "./pages/Suppliers";
import NewEvaluation from "./pages/NewEvaluation";
import Evaluations from "./pages/Evaluations";
import EvaluationDetail from "./pages/EvaluationDetail";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function DashboardOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isPlebian } = useAuth();
  if (isPlebian) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute><DashboardOnlyRoute><Suppliers /></DashboardOnlyRoute></ProtectedRoute>} />
            <Route path="/evaluations/new" element={<ProtectedRoute><DashboardOnlyRoute><NewEvaluation /></DashboardOnlyRoute></ProtectedRoute>} />
            <Route path="/evaluations/:id" element={<ProtectedRoute><DashboardOnlyRoute><EvaluationDetail /></DashboardOnlyRoute></ProtectedRoute>} />
            <Route path="/evaluations" element={<ProtectedRoute><DashboardOnlyRoute><Evaluations /></DashboardOnlyRoute></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><DashboardOnlyRoute><Reports /></DashboardOnlyRoute></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><DashboardOnlyRoute><AdminRoute><Admin /></AdminRoute></DashboardOnlyRoute></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
