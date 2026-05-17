import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { thumbUrl } from '@/lib/imageUrl';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Post {
  id: string; user_id: string; name: string; category: ProductCategory;
  image_url: string | null; is_public: boolean; likes_count: number;
  comments_count: number; created_at: string;
  display_name?: string;
}

export function CommunityModeration() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [del, setDel] = useState<Post | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('community_posts')
      .select('*').order('created_at', { ascending: false }).limit(200);
    const list = (data || []) as Post[];
    const userIds = Array.from(new Set(list.map((p) => p.user_id)));
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      const map: Record<string, string> = {};
      (profs || []).forEach((p) => { map[p.user_id] = p.display_name || ''; });
      list.forEach((p) => { p.display_name = map[p.user_id]; });
    }
    setPosts(list);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const togglePublic = async (p: Post) => {
    await supabase.from('community_posts').update({ is_public: !p.is_public }).eq('id', p.id);
    toast.success(p.is_public ? '已设为私密' : '已公开');
    void load();
  };

  const remove = async () => {
    if (!del) return;
    const { error } = await supabase.from('community_posts').delete().eq('id', del.id);
    if (error) toast.error('删除失败');
    else { toast.success('已删除'); void load(); }
    setDel(null);
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">共 {posts.length} 条社区动态</div>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">图</TableHead>
              <TableHead>商品</TableHead>
              <TableHead className="hidden sm:table-cell">发布人</TableHead>
              <TableHead className="hidden md:table-cell">点赞 / 评论</TableHead>
              <TableHead className="hidden md:table-cell">时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />加载中...
              </TableCell></TableRow>
            ) : posts.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">暂无内容</TableCell></TableRow>
            ) : posts.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {p.image_url ? (
                    <img src={thumbUrl(p.image_url, 96) || p.image_url} className="w-10 h-10 rounded-md object-cover" alt={p.name} loading="lazy" decoding="async" />
                  ) : <div className="w-10 h-10 rounded-md bg-muted" />}
                </TableCell>
                <TableCell>
                  <div className="font-medium truncate max-w-[180px]">{p.name}</div>
                  <Badge variant="secondary" className="mt-0.5">{CATEGORY_LABELS[p.category]}</Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{p.display_name || '匿名'}</TableCell>
                <TableCell className="hidden md:table-cell text-sm tabular-nums">❤ {p.likes_count} · 💬 {p.comments_count}</TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString('zh-CN')}
                </TableCell>
                <TableCell>
                  <Badge variant={p.is_public ? 'default' : 'outline'}>
                    {p.is_public ? '公开' : '私密'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => togglePublic(p)} title={p.is_public ? '设为私密' : '公开'}>
                    {p.is_public ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDel(p)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>将永久删除「{del?.name}」及其点赞与评论。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
