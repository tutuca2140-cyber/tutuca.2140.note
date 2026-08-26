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
      className="fixed right-4 top-3 z-[60] gap-2 bg-background/95 shadow-sm backdrop-blur lg:right-6 lg:top-5"
    >
      {dark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{dark ? "Diurno" : "Noturno"}</span>
    </Button>
  );
}
