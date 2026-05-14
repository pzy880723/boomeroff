import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays } from 'lucide-react';
import { MyScheduleList } from '@/components/me/MyScheduleList';
import { ShopScheduleList } from '@/components/me/ShopScheduleList';

export function SchedulePanel() {
  return (
    <Card className="p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">我的排班</h3>
      </div>
      <Tabs defaultValue="me" className="space-y-3">
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="me" className="text-xs">我的</TabsTrigger>
          <TabsTrigger value="shop" className="text-xs">门店</TabsTrigger>
        </TabsList>
        <TabsContent value="me" className="m-0">
          <MyScheduleList />
        </TabsContent>
        <TabsContent value="shop" className="m-0">
          <ShopScheduleList />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
