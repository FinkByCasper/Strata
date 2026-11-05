import React, { useEffect, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { api } from './api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const RoleSelect = ({ value, onChange, className }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className={className} aria-label="Role"><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="viewer">Can view</SelectItem><SelectItem value="editor">Can edit</SelectItem></SelectContent>
  </Select>
);

export function People({ id }) {
  const [people, setPeople] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');

  const refresh = () => api.shares(id).then(setPeople).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const attempt = async (action) => {
    try { await action(); setError(''); await refresh(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="grid gap-2">
      <Label>People</Label>
      {people?.length === 0 && <p className="text-sm text-muted-foreground">Only you can open this diagram. Add someone by the email they signed up with.</p>}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {people?.map((p) => (
          <li key={p.userId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{p.displayName} <span className="text-muted-foreground">{p.email}</span></span>
            <RoleSelect value={p.role} className="h-8 w-32" onChange={(r) => attempt(() => api.share(id, p.email, r))} />
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.displayName}`} onClick={() => attempt(() => api.unshare(id, p.userId))}><X /></Button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); attempt(async () => { await api.share(id, email, role); setEmail(''); }); }}>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Email of the person to add" />
        <RoleSelect value={role} onChange={setRole} className="w-32" />
        <Button type="submit" variant="outline"><UserPlus /> Add</Button>
      </form>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
