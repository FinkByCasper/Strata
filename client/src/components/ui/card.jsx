import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = ({ className, ...props }) => <div data-slot="card" className={cn('flex flex-col gap-4 rounded-xl border bg-card text-card-foreground shadow-sm', className)} {...props} />;
const CardHeader = ({ className, ...props }) => <div data-slot="card-header" className={cn('flex flex-col gap-1 px-4 pt-4', className)} {...props} />;
const CardTitle = ({ className, ...props }) => <h3 data-slot="card-title" className={cn('text-base leading-none font-semibold', className)} {...props} />;
const CardDescription = ({ className, ...props }) => <p data-slot="card-description" className={cn('text-xs text-muted-foreground', className)} {...props} />;
const CardContent = ({ className, ...props }) => <div data-slot="card-content" className={cn('px-4 pb-4', className)} {...props} />;

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
