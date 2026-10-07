import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Hint } from '@/components/ui/tooltip';
import { useTheme } from '@/theme';

// Light / Dark / System picker. The button shows the theme that is currently in effect.
export function ThemeToggle({ variant = 'ghost', size = 'icon' }) {
  const theme = useTheme((s) => s.theme);
  const dark = useTheme((s) => s.dark);
  const setTheme = useTheme((s) => s.setTheme);
  return (
    <DropdownMenu>
      <Hint label="Theme">
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} aria-label="Theme">{dark ? <Moon /> : <Sun />}</Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent className="min-w-36">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor /> System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
