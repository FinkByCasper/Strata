import React, { useState } from 'react';
import { Logo } from './Logo';
import { useAuth } from './auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';

export function SignIn() {
  const signupOpen = useAuth((s) => s.signupOpen);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { signIn, signUp } = useAuth.getState();
      await (creating ? signUp(form.email, form.password, form.name) : signIn(form.email, form.password));
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <main className="mx-auto grid min-h-full max-w-sm content-center gap-6 px-4 py-10">
      <div className="flex justify-end"><ThemeToggle /></div>
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight"><Logo size={44} /> Strata</h1>
      <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-card p-5 shadow-xs">
        <h2 className="text-lg font-semibold">{creating ? 'Create an account' : 'Sign in'}</h2>
        {creating && (
          <div className="grid gap-1.5"><Label htmlFor="name">Name</Label><Input id="name" autoComplete="name" value={form.name} onChange={set('name')} placeholder="Shown to people you share with" /></div>
        )}
        <div className="grid gap-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={creating ? 10 : undefined} autoComplete={creating ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} />
          {creating && <p className="text-xs text-muted-foreground">At least 10 characters.</p>}
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{creating ? 'Create account' : 'Sign in'}</Button>
        {(signupOpen || creating) && (
          <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => { setCreating(!creating); setError(''); }}>
            {creating ? 'I already have an account' : 'Create an account'}
          </button>
        )}
      </form>
    </main>
  );
}
