"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme/theme-context";

interface ThemeToggleProps {
  className?: string;
  showDropdown?: boolean;
}

export function ThemeToggle({ className = "", showDropdown = true }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const options: Array<{ value: Theme; label: string; icon: typeof Sun; hint: string }> = [
    {
      value: "light",
      label: "Light",
      icon: Sun,
      hint: "Crisp daylight theme",
    },
    {
      value: "dark",
      label: "Dark",
      icon: Moon,
      hint: "Easy on the eyes in low light",
    },
    {
      value: "system",
      label: "System default",
      icon: Laptop,
      hint: `Matches device settings (${mounted ? resolvedTheme : "auto"})`,
    },
  ];

  if (!showDropdown) {
    return (
      <button
        type="button"
        className={`icon-button theme-toggle-btn ${className}`}
        onClick={toggleTheme}
        aria-label={
          mounted
            ? `Current theme: ${theme} (${resolvedTheme}). Click to switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode.`
            : "Toggle theme"
        }
        title={
          mounted
            ? `Theme: ${theme === "system" ? "System (" + resolvedTheme + ")" : theme}. Click to toggle.`
            : "Toggle theme"
        }
      >
        {mounted && resolvedTheme === "dark" ? (
          <Sun size={19} className="theme-icon-sun" />
        ) : (
          <Moon size={19} className="theme-icon-moon" />
        )}
      </button>
    );
  }

  return (
    <div className={`theme-toggle-wrap ${className}`} ref={containerRef}>
      <button
        type="button"
        className={`icon-button theme-toggle-btn ${menuOpen ? "button-selected" : ""}`}
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-label="Color theme preferences"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        title={`Theme: ${theme === "system" ? `System default (${resolvedTheme})` : theme}. Click to customize.`}
      >
        {mounted && resolvedTheme === "dark" ? (
          <Moon size={18} className="theme-icon-moon" />
        ) : (
          <Sun size={18} className="theme-icon-sun" />
        )}
      </button>

      {menuOpen && (
        <div className="theme-menu-popover" role="menu" aria-label="Theme selection">
          <div className="theme-menu-header">
            <span>APPEARANCE</span>
            <small>{theme === "system" ? `System (${resolvedTheme})` : theme}</small>
          </div>
          <div className="theme-menu-list">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isSelected = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={`theme-menu-item ${isSelected ? "theme-menu-item-active" : ""}`}
                  onClick={() => {
                    setTheme(opt.value);
                    setMenuOpen(false);
                  }}
                >
                  <span className="theme-menu-icon">
                    <Icon size={16} />
                  </span>
                  <div className="theme-menu-copy">
                    <strong>{opt.label}</strong>
                    <small>{opt.hint}</small>
                  </div>
                  {isSelected && (
                    <span className="theme-menu-check">
                      <Check size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
