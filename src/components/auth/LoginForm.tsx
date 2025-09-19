import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface LoginFormProps {
  onLogin: (
    email: string,
    password: string,
    role: "patient" | "doctor" | "admin",
    nameFromServer?: string,
    idFromServer?: number
  ) => void;
}

const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const ct = res.headers.get("content-type") || "";
      let data: any = null;
      if (ct.includes("application/json")) data = await res.json();
      else {
        const text = await res.text();
        try { data = JSON.parse(text); } catch { throw new Error(text || "Non-JSON response"); }
      }
      if (!res.ok) throw new Error(data?.message || data?.details || `HTTP ${res.status}`);
      // Expect shape: { token, user: { id, name, email, role } }
      const token = data?.token as string | undefined;
      const u = data?.user || {};
      const rawRole = String(u?.role ?? "patient").toLowerCase();
      const serverRole = (rawRole === "patient" || rawRole === "doctor" || rawRole === "admin") ? rawRole : "patient";
      // Persist token for subsequent API calls
      try { if (token) localStorage.setItem("auth_token", token); } catch {}
      onLogin(u?.email || email, password, serverRole, u?.name || email, u?.id);
      toast({ title: "Welcome!", description: `Successfully logged in as ${serverRole}` });
    } catch (err: any) {
      toast({ title: "Login Failed", description: err?.message ?? "Invalid credentials", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        {/* Logo and branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-primary to-primary/80 rounded-2xl mb-4">
            <Heart className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">CareLink HMS</h1>
          <p className="text-muted-foreground mt-2">Healthcare Management System</p>
        </div>

        <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Welcome Back</CardTitle>
            <CardDescription className="text-center">
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Note: Role is determined by your account on the server */}
              <Alert>
                <AlertDescription className="text-xs">
                  Your dashboard is determined by your account role on the server (patient/doctor/admin). No role selection needed here.
                </AlertDescription>
              </Alert>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Info */}
              <Alert>
                <AlertDescription className="text-xs">
                  Enter your account credentials to sign in.
                </AlertDescription>
              </Alert>

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>

              {/* Forgot password */}
              <div className="text-center">
                <Button variant="link" className="text-sm text-muted-foreground">
                  Forgot your password?
                </Button>
                <div className="mt-1">
                  <Link to="/register" className="text-sm text-muted-foreground hover:underline">
                    Don’t have an account? Create one
                  </Link>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2024 CareLink HMS. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default LoginForm;