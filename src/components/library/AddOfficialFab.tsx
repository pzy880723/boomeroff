import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { AiKnowledgeDialog } from '@/components/admin/AiKnowledgeDialog';

interface Props {
  onAdded: () => void;
}

export function AddOfficialFab({ onAdded }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="AI 新增官方知识"
        className="fixed right-4 bottom-24 z-30 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <Wand2 className="w-5 h-5" />
      </button>
      <AiKnowledgeDialog open={open} onOpenChange={setOpen} onSaved={onAdded} />
    </>
  );
}
