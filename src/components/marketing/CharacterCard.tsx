import { User, ShieldCheck } from 'lucide-react';

export function CharacterCard({
  character, onClick, selected, manageMode,
}: {
  character: any;
  onClick?: () => void;
  selected?: boolean;
  manageMode?: boolean;
}) {
  const verified = !!character.verified_asset_uri;
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
      {verified ? (
        <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 bg-emerald-500/90 text-white text-[8px] px-1 py-[1px] rounded leading-tight" title="已通过火山真人认证">
          <ShieldCheck className="w-2.5 h-2.5" />已认证
        </span>
      ) : (
        <span className="absolute top-1 right-1 bg-black/55 text-white text-[8px] px-1 py-[1px] rounded leading-tight" title="未认证 · 真人形象易被审核拦截">未认证</span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent text-white text-[10px] px-1.5 py-1 leading-tight">
        <span className="block truncate font-medium">{character.name}</span>
        {character.role_label && <span className="block truncate opacity-70 text-[9px]">{character.role_label}</span>}
      </span>
    </button>
  );
}
