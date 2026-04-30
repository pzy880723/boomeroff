import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  title: string;
  back?: string;
  right?: ReactNode;
  subtitle?: string;
}

export function PageHeader({ title, back, right, subtitle }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 glass safe-top">
      <div className="container mx-auto max-w-screen-md flex items-center gap-2 h-14 px-3">
        {back ? (
          <Link to={back}>
            <Button variant="ghost" size="icon" className="h-9 w-9 -ml-2">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
        ) : null}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
