import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { tryIssueInvoiceForPaidOrder } from "@/lib/invoices";
export const runtime="nodejs";
export async function POST(request:Request){
 const raw=await request.text();const signature=request.headers.get("x-razorpay-signature")||"";
 try{
  if(!verifyWebhookSignature(raw,signature))return NextResponse.json({error:"Invalid signature"},{status:400});
  const event=JSON.parse(raw) as {event?:string;payload?:{payment?:{entity?:{id?:string;order_id?:string;status?:string}}};id?:string};
  const entity=event.payload?.payment?.entity;
  if(event.event==="payment.captured"&&entity?.id&&entity.order_id){
   const order=await db.order.findFirst({where:{razorpayOrderId:entity.order_id}});
   if(order && order.status==="PENDING_PAYMENT" && order.paymentStatus==="CREATED" && (!order.paymentExpiresAt||order.paymentExpiresAt>new Date())){
    await db.$transaction(async tx=>{
     const key=event.id||crypto.createHash("sha256").update(raw).digest("hex");
     const already=await tx.paymentEvent.findUnique({where:{providerEventId:key}});
     if(already)return;
     const items=await tx.orderItem.findMany({where:{orderId:order.id}});
     for(const item of items){const changed=await tx.product.updateMany({where:{id:item.productId,stock:{gte:item.quantity},status:"ACTIVE"},data:{stock:{decrement:item.quantity}}});if(changed.count!==1)throw new Error("Inventory conflict");}
     await tx.order.update({where:{id:order.id},data:{status:"PAID",paymentStatus:"CAPTURED",razorpayPaymentId:entity.id}});
     await tx.paymentEvent.create({data:{orderId:order.id,providerEventId:key,eventType:event.event||"unknown",payloadHash:crypto.createHash("sha256").update(raw).digest("hex")}});
    });
   }
   if (order) {
    // Invoice configuration errors must not cause Razorpay retries for a captured payment.
    await tryIssueInvoiceForPaidOrder(order.id);
   }
  }
  return NextResponse.json({received:true});
 }catch{return NextResponse.json({error:"Webhook processing failed"},{status:400});}
}
