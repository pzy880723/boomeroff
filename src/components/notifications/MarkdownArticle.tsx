import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import DOMPurify from 'isomorphic-dompurify';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
  className?: string;
}

const PROSE = [
  'prose prose-sm max-w-none',
  'prose-headings:font-semibold prose-headings:text-foreground',
  'prose-p:leading-relaxed prose-p:text-foreground/90',
  'prose-a:text-primary',
  'prose-img:rounded-lg prose-img:my-3',
  'prose-strong:text-foreground',
  'prose-ul:my-2 prose-ol:my-2',
];

export function MarkdownArticle({ content, className }: Props) {
  const raw = content || '';
  const looksLikeHtml = raw.trim().startsWith('<');

  if (looksLikeHtml) {
    const safe = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's', 'a', 'blockquote', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'img', 'hr', 'span', 'div',
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class'],
    });
    return (
      <div
        className={cn(...PROSE, className)}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  }

  return (
    <div className={cn(...PROSE, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{raw}</ReactMarkdown>
    </div>
  );
}
