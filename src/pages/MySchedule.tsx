import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MyScheduleList } from '@/components/me/MyScheduleList';
import { ShopScheduleList } from '@/components/me/ShopScheduleList';

export default function MySchedule() {
  return (
    <>
      <PageHeader title="店铺排班" back="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3">
        <Tabs defaultValue="me" className="space-y-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="me">我的</TabsTrigger>
            <TabsTrigger value="shop">门店</TabsTrigger>
          </TabsList>
          <TabsContent value="me" className="m-0">
            <MyScheduleList />
          </TabsContent>
          <TabsContent value="shop" className="m-0">
            <ShopScheduleList />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
