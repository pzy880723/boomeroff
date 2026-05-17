import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { AuthPage } from '@/components/auth/AuthPage';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  ArrowLeft, 
  Calendar, 
  Sparkles,
  Package,
  Loader2,
  Filter
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import type { Json } from '@/integrations/supabase/types';
import { ProductDetailDialog } from '@/components/history/ProductDetailDialog';
import { normalizeSellingPoints } from '@/lib/script';

const PAGE_SIZE = 20;

interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  era: string | null;
  origin: string | null;
  material: string | null;
  craft: string | null;
  description: string | null;
  dimensions: string | null;
  condition: string | null;
  created_at: string;
  selling_points: Json | null;
  tips: string | null;
  image_url: string | null;
}

export default function History() {
  const { user, loading: authLoading } = useAuth();
  const { can } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  
  // 详情弹窗
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchProducts = useCallback(async (pageNum: number, append: boolean = false) => {
    if (!append) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      let query = supabase
        .from('products')
        .select('id, name, category, era, origin, material, craft, description, dimensions, condition, created_at, selling_points, tips, image_url')
        .order('created_at', { ascending: false });

      // 仅自己识别的（除非有"查看全部识别历史"权限）
      if (user && !can('history.read_all')) {
        query = query.eq('created_by', user.id);
      }

      // 分类筛选
      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory);
      }

      // 分页
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error } = await query;

      if (error) throw error;
      
      const newProducts = data || [];
      setHasMore(newProducts.length === PAGE_SIZE);
      
      if (append) {
        setProducts(prev => [...prev, ...newProducts]);
      } else {
        setProducts(newProducts);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [selectedCategory, user, can]);

  useEffect(() => {
    if (user) {
      setPage(0);
      fetchProducts(0, false);
    }
  }, [user, selectedCategory, fetchProducts]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchProducts(nextPage, true);
  };

  // 本地搜索过滤
  const filteredProducts = searchQuery.trim() === ''
    ? products
    : products.filter((p) => {
        const query = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          p.era?.toLowerCase().includes(query) ||
          p.material?.toLowerCase().includes(query) ||
          p.craft?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
        );
      });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setDetailOpen(true);
  };

  const handleProductUpdate = () => {
    // 重新获取当前页面的数据
    setPage(0);
    fetchProducts(0, false);
  };

  const handleProductDelete = () => {
    // 从列表中移除删除的产品
    if (selectedProduct) {
      setProducts(prev => prev.filter(p => p.id !== selectedProduct.id));
      setSelectedProduct(null);
    }
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
      <PageHeader title="历史记录" back="/me" />
      
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

        {/* 搜索和筛选 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索商品名称、材质、工艺..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={selectedCategory}
            onValueChange={(value) => setSelectedCategory(value as ProductCategory | 'all')}
          >
            <SelectTrigger className="w-full sm:w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="全部类别" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类别</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 商品列表 */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <Skeleton className="aspect-square w-full" />
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
                {searchQuery || selectedCategory !== 'all' 
                  ? '没有找到匹配的商品' 
                  : '开始识别商品后，记录将显示在这里'}
              </p>
              {(searchQuery || selectedCategory !== 'all') && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                >
                  清除筛选
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => (
                <Card 
                  key={product.id} 
                  className="hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
                  onClick={() => handleProductClick(product)}
                >
                  {/* 商品图片 */}
                  <div className="aspect-square w-full overflow-hidden bg-muted">
                    {product.image_url ? (
                      <img 
                        src={thumbUrl(product.image_url, 480) || product.image_url} 
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-12 h-12 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
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

                    {/* 卖点预览 */}
                    {(() => {
                      const sp = normalizeSellingPoints(product.selling_points);
                      if (sp.length === 0) return null;
                      return (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1.5">
                            <Sparkles className="h-3 w-3" />
                            核心卖点
                          </div>
                          <ul className="space-y-1">
                            {sp.slice(0, 2).map((p, i) => (
                              <li key={i} className="text-xs text-muted-foreground line-clamp-1">· {p.text}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* 加载更多按钮 */}
            {hasMore && !searchQuery && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="min-w-32"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      加载中...
                    </>
                  ) : (
                    '加载更多'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* 产品详情弹窗 */}
      <ProductDetailDialog
        product={selectedProduct}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onProductUpdate={handleProductUpdate}
        onProductDelete={handleProductDelete}
      />
    </div>
  );
}
