import { OrderView } from "../../../components/order-view";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OrderView id={(await params).id} />;
}
