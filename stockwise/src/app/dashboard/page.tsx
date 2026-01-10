import { getStockItems, getPurchaseOrders, getAppUsers } from '@/lib/queries';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
    const [stockItems, purchaseOrders, appUsers] = await Promise.all([
        getStockItems(),
        getPurchaseOrders(),
        getAppUsers()
    ]);

    return (
        <DashboardClient
            stockItems={stockItems}
            purchaseOrders={purchaseOrders}
            appUsers={appUsers}
        />
    );
}