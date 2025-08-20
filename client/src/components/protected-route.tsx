import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredRole?: "superuser" | "admin" | "vendor";
}

export default function ProtectedRoute({ 
  children, 
  requiredPermission, 
  requiredRole 
}: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Verificar autenticación
    if (!isAuthenticated || !user) {
      setLocation("/");
      return;
    }

    // Verificar si debe cambiar contraseña
    if (user.mustChangePassword && window.location.pathname !== "/change-password") {
      setLocation("/change-password");
      return;
    }

    // Verificar rol requerido
    if (requiredRole && user.role !== requiredRole) {
      // Para superuser, no redirigir, mantener acceso
      if (user.role !== "superuser") {
        setLocation("/dashboard");
        return;
      }
    }

    // Verificar permiso requerido (solo para vendors)
    if (requiredPermission && user.role === "vendor") {
      const userPermissions = user.permissions || [];
      if (!userPermissions.includes(requiredPermission)) {
        setLocation("/dashboard");
        return;
      }
    }
  }, [isAuthenticated, user, requiredPermission, requiredRole, setLocation]);

  // Si no está autenticado o debe cambiar contraseña, no mostrar contenido
  if (!isAuthenticated || !user) {
    return null;
  }

  if (user.mustChangePassword && window.location.pathname !== "/change-password") {
    return null;
  }

  // Verificar rol
  if (requiredRole && user.role !== requiredRole && user.role !== "superuser") {
    return null;
  }

  // Verificar permiso para vendors
  if (requiredPermission && user.role === "vendor") {
    const userPermissions = user.permissions || [];
    if (!userPermissions.includes(requiredPermission)) {
      return null;
    }
  }

  return <>{children}</>;
}