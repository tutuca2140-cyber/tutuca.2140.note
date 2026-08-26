import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggleTheme}
      aria-label={`Ativar modo ${dark ? "diurno" : "noturno"}`}
      aria-pressed={dark}
      className="mt-3 w-full justify-start gap-3 bg-background"
    >
      {dark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
      <span>Modo {dark ? "diurno" : "noturno"}</span>
    </Button>
  );
}
