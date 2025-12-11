import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/layout/Header';
import { AuthPage } from '@/components/auth/AuthPage';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  ArrowLeft, 
  Calendar, 
  Tag, 
  Sparkles,
  Package
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import type { Json } from '@/integrations/supabase/types';

interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  era: string | null;
  material: string | null;
  craft: string | null;
  description: string | null;
  created_at: string;
  scripts: Json | null;
}

export default function History() {
  const { user, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredProducts(products);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredProducts(
        products.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query) ||
            p.era?.toLowerCase().includes(query) ||
            p.material?.toLowerCase().includes(query) ||
            p.craft?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, products]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, era, material, craft, description, created_at, scripts')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-6 space-y-6">
        {/* 页面标题和返回按钮 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">识别历史</h1>
              <p className="text-muted-foreground text-sm">
                共 {filteredProducts.length} 条记录
              </p>
            </div>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索商品名称、类别、材质、工艺..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* 商品列表 */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">暂无识别记录</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchQuery ? '没有找到匹配的商品' : '开始识别商品后，记录将显示在这里'}
              </p>
              {searchQuery && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSearchQuery('')}
                >
                  清除搜索
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-1">
                      {product.name}
                    </CardTitle>
                    <Badge variant="secondary" className="shrink-0">
                      {CATEGORY_LABELS[product.category] || product.category}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatDate(product.created_at)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* 基本信息 */}
                  <div className="flex flex-wrap gap-1.5">
                    {product.era && (
                      <Badge variant="outline" className="text-xs">
                        {product.era}
                      </Badge>
                    )}
                    {product.material && (
                      <Badge variant="outline" className="text-xs">
                        {product.material}
                      </Badge>
                    )}
                    {product.craft && (
                      <Badge variant="outline" className="text-xs">
                        {product.craft}
                      </Badge>
                    )}
                  </div>

                  {/* 描述 */}
                  {product.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.description}
                    </p>
                  )}

                  {/* 卖点脚本预览 */}
                  {product.scripts && typeof product.scripts === 'object' && !Array.isArray(product.scripts) && (product.scripts as Record<string, string>).sales && (
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1.5">
                        <Sparkles className="h-3 w-3" />
                        卖点
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {(product.scripts as Record<string, string>).sales}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
