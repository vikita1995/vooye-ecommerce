import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyCheckoutSignature } from "@/lib/razorpay";
const schema=z.object({orderId:z.string(),razorpayOrderId:z.string(),razorpayPaymentId:z.string(),razorpaySignature:z.string()});
export async function POST(request:Request){
 try{
  const user=await authenticate(request);const parsed=schema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:"Invalid payment response"},{status:400});
  const v=parsed.data;
  const order=await db.order.findFirst({where:{id:v.orderId,userId:user.id}});
  if(!order||!order.razorpayOrderId||order.razorpayOrderId!==v.razorpayOrderId)return NextResponse.json({error:"Order not found"},{status:404});
  if(order.status==="CANCELLED"||order.status==="REFUNDED"||order.paymentExpiresAt && order.paymentExpiresAt < new Date())return NextResponse.json({error:"Order is no longer payable"},{status:409});
  if(!verifyCheckoutSignature(v.razorpayOrderId,v.razorpayPaymentId,v.razorpaySignature))return NextResponse.json({error:"Payment signature verification failed"},{status:400});
  if(order.paymentStatus==="CAPTURED"&&order.razorpayPaymentId===v.razorpayPaymentId)return NextResponse.json({ok:true,orderNumber:order.orderNumber});
  await db.$transaction(async tx=>{
   const current=await tx.order.findUniqueOrThrow({where:{id:order.id}});
   if(current.status!=="PENDING_PAYMENT"||current.paymentStatus!=="CREATED")throw new Error("Order state changed; contact support if your payment was charged");
   for(const item of await tx.orderItem.findMany({where:{orderId:order.id}})){
    const changed=await tx.product.updateMany({where:{id:item.productId,stock:{gte:item.quantity},status:"ACTIVE"},data:{stock:{decrement:item.quantity}}});
    if(changed.count!==1)throw new Error("Inventory changed during payment; support reconciliation required");
   }
   await tx.order.update({where:{id:order.id},data:{status:"PAID",paymentStatus:"CAPTURED",razorpayPaymentId:v.razorpayPaymentId}});
  });
  return NextResponse.json({ok:true,orderNumber:order.orderNumber});
 }catch(e){const m=e instanceof Error?e.message:"Payment verification failed";return NextResponse.json({error:m.includes("Authentication")?m:"Payment could not be confirmed"},{status:m.includes("Authentication")?401:500});}
}
