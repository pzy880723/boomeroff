import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
  className?: string;
}

export function MarkdownArticle({ content, className }: Props) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none',
        'prose-headings:font-semibold prose-headings:text-foreground',
        'prose-p:leading-relaxed prose-p:text-foreground/90',
        'prose-a:text-primary',
        'prose-img:rounded-lg prose-img:my-3',
        'prose-strong:text-foreground',
        'prose-ul:my-2 prose-ol:my-2',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
    </div>
  );
}
