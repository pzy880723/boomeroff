import { User } from 'lucide-react';

export function CharacterCard({
  character, onClick, selected, manageMode,
}: {
  character: any;
  onClick?: () => void;
  selected?: boolean;
  manageMode?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group relative aspect-square rounded-md overflow-hidden bg-muted border transition-all text-left',
        selected ? 'ring-2 ring-primary border-primary' : 'border-border hover:border-accent/50',
      ].join(' ')}
    >
      {character.cover_url ? (
        <img src={character.cover_url} alt={character.name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center"><User className="w-6 h-6 text-muted-foreground" /></div>
      )}
      {character.auto_anchor && (
        <span className="absolute top-1 left-1 bg-accent/85 text-accent-foreground text-[8px] px-1 rounded leading-tight">AUTO</span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent text-white text-[10px] px-1.5 py-1 leading-tight">
        <span className="block truncate font-medium">{character.name}</span>
        {character.role_label && <span className="block truncate opacity-70 text-[9px]">{character.role_label}</span>}
      </span>
    </button>
  );
}
