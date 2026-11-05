import React from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { useAuth } from './auth';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><UserRound /> {user.displayName}</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
