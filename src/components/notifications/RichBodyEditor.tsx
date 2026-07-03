import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import { cn } from '@/lib/utils';
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote,
  Image as ImageIcon, Undo2, Redo2, Loader2,
} from 'lucide-react';
import { uploadNotificationImage } from '@/lib/uploadNotificationImage';
import { toast } from 'sonner';
import { useState } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  userId: string;
  placeholder?: string;
  className?: string;
}

// 判断当前 value 是 HTML 还是 Markdown;是 markdown 则先转 HTML
function toHtml(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (s.startsWith('<')) return s;
  try {
    return marked.parse(s, { async: false, breaks: true, gfm: true }) as string;
  } catch {
    return s;
  }
}

export function RichBodyEditor({ value, onChange, userId, placeholder, className }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suppressChange = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Image.configure({ inline: false, HTMLAttributes: { class: 'rounded-lg my-3 max-w-full' } }),
      Placeholder.configure({ placeholder: placeholder || '在这里写正文，支持插图、加粗、标题…' }),
    ],
    content: toHtml(value),
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[220px]',
          'prose-headings:font-semibold prose-p:leading-relaxed',
          'prose-img:rounded-lg prose-img:my-3 prose-a:text-primary',
        ),
      },
    },
    onUpdate({ editor }) {
      if (suppressChange.current) return;
      onChange(editor.getHTML());
    },
  });

  // 外部 value 变化(比如 AI 重写)时,同步进 editor —— 但避免打字循环
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const nextHtml = toHtml(value);
    // 只在真的不一样时更新,防止光标跳
    if (nextHtml && nextHtml !== currentHtml) {
      suppressChange.current = true;
      editor.commands.setContent(nextHtml, { emitUpdate: false });
      suppressChange.current = false;
    }
  }, [value, editor]);

  const pickImage = () => fileInputRef.current?.click();

  const handleFile = async (file: File | null) => {
    if (!file || !editor) return;
    setUploading(true);
    try {
      const url = await uploadNotificationImage(file, userId);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (e: any) {
      toast.error(e?.message || '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  if (!editor) return null;

  return (
    <div className={cn('border border-border/60 rounded-lg overflow-hidden bg-background', className)}>
      <Toolbar editor={editor} onPickImage={pickImage} uploading={uploading} />
      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0] || null;
          void handleFile(f);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}

function TbBtn({
  active, disabled, onClick, title, children,
}: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition',
        active && 'bg-primary/15 text-primary',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onPickImage, uploading }: { editor: Editor; onPickImage: () => void; uploading: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-border/50 bg-muted/40">
      <TbBtn title="加粗" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="w-4 h-4" />
      </TbBtn>
      <TbBtn title="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="w-4 h-4" />
      </TbBtn>
      <div className="w-px h-5 bg-border mx-1" />
      <TbBtn title="大标题" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="w-4 h-4" />
      </TbBtn>
      <TbBtn title="小标题" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="w-4 h-4" />
      </TbBtn>
      <div className="w-px h-5 bg-border mx-1" />
      <TbBtn title="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="w-4 h-4" />
      </TbBtn>
      <TbBtn title="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="w-4 h-4" />
      </TbBtn>
      <TbBtn title="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="w-4 h-4" />
      </TbBtn>
      <div className="w-px h-5 bg-border mx-1" />
      <TbBtn title="插入图片" onClick={onPickImage} disabled={uploading}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
      </TbBtn>
      <div className="flex-1" />
      <TbBtn title="撤销" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="w-4 h-4" />
      </TbBtn>
      <TbBtn title="重做" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="w-4 h-4" />
      </TbBtn>
    </div>
  );
}
